import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import Module from "node:module";
import { after, before, describe, test } from "node:test";
import { serializeSignedCookie } from "better-call";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { ACTIVE_ASSIGNMENT_COOKIE } from "@/modules/access/access.constant";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { grantBlockedReason, isPrivilegedRole, lockBlockedReason, revokeBlockedReason, roleVisibleTo, rolePermissionsBlockedReason } from "@/modules/access/access.rule";
import type { Permission } from "@/modules/access/access.type";
import { auditLogs } from "@/modules/audit/audit.schema";
import { AUTH_COOKIE_PREFIX } from "@/modules/authentication/authentication.constant";
import { session, user } from "@/modules/authentication/authentication.schema";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { mailOutbox } from "@/modules/mail/mail.schema";
import { administrativeClasses, lecturers, staffMembers, students } from "@/modules/users/users.schema";
// Chỉ lấy kiểu: action, query nạp động sau khi dựng môi trường request của Next (installNextRuntime).
import type * as AccessAction from "@/modules/access/access.action";
import type * as AccessQuery from "@/modules/access/access.query";
import type * as UsersAction from "@/modules/users/users.action";

// ---------- Môi trường request của Next cho test gọi thẳng server action (cùng cách tests/pdf.test.ts dựng):
// AsyncLocalStorage toàn cục, cờ authInterrupts, bản react-server của next/navigation. Gọi installNextRuntime() trước khi import() action.
let installed = false;

function installNextRuntime() {
  if (installed) return;
  installed = true;
  Object.assign(globalThis, { AsyncLocalStorage });
  Object.assign(process.env, { __NEXT_EXPERIMENTAL_AUTH_INTERRUPTS: "true" });
  const resolveFilename = Reflect.get(Module, "_resolveFilename") as (request: string, ...rest: unknown[]) => string;
  Reflect.set(Module, "_resolveFilename", function (this: unknown, request: string, ...rest: unknown[]) {
    return resolveFilename.call(this, request === "next/navigation" ? "next/dist/client/components/navigation.react-server.js" : request, ...rest);
  });
}

const createdSessions: string[] = [];

// Phiên tạo thẳng trong DB, cookie ký như better-auth; assignmentId chọn vai trò đang dùng (cookie đổi vai trò).
async function cookieOf(userId: string, assignmentId?: string) {
  const token = randomBytes(24).toString("base64url");
  const [row] = await db.insert(session).values({ userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning({ id: session.id });
  createdSessions.push(row.id);
  const signed = await serializeSignedCookie(`${AUTH_COOKIE_PREFIX}.session_token`, token, env.DEFEAT_BETTER_AUTH_SESSION_SIGNING_SECRET_KEY);
  return [signed.split(";")[0], ...(assignmentId ? [`${ACTIVE_ASSIGNMENT_COOKIE}=${assignmentId}`] : [])].join("; ");
}

async function deleteTestSessions() {
  if (createdSessions.length > 0) await db.delete(session).where(inArray(session.id, createdSessions.splice(0)));
}

async function requestRunner() {
  const [{ workAsyncStorage }, { workUnitAsyncStorage }, { RequestCookies }] = await Promise.all([
    import("next/dist/server/app-render/work-async-storage.external.js"),
    import("next/dist/server/app-render/work-unit-async-storage.external.js"),
    import("next/dist/server/web/spec-extension/cookies.js"),
  ]);
  return <T>(cookie: string, run: () => Promise<T>): Promise<T> => {
    const headers = new Headers({ cookie });
    // Pha "action", incrementalCache giả để revalidatePath chạy được; after() (gửi thư ngay) bị bỏ qua, thư vẫn nằm trong hàng đợi.
    const workStore = { route: "/test", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, incrementalCache: {}, afterContext: { after: () => {} } } as never;
    const requestStore = {
      type: "request",
      phase: "action",
      headers,
      cookies: new RequestCookies(headers),
      userspaceMutableCookies: new RequestCookies(headers),
      implicitTags: { tags: [] },
    } as never;
    return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(requestStore, run));
  };
}

const FORBIDDEN = "NEXT_HTTP_ERROR_FALLBACK;403";

async function expectForbidden(run: () => Promise<unknown>) {
  const error = await run().then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.equal(error && typeof error === "object" && "digest" in error ? error.digest : null, FORBIDDEN);
}

installNextRuntime();

after(() => db.$client.end());

const facultyRole = { scope: "faculty" as const, isSystem: false, permissions: ["dashboard.view", "students.view"] as Permission[] };
const universityRole = { scope: "university" as const, isSystem: false, permissions: ["dashboard.view"] as Permission[] };
const facultyManager = { id: "u-faculty", faculty: "Khoa A", roleKey: null, permissions: ["access.manage", "dashboard.view", "students.view", "advisors.assign"] as Permission[] };
const schoolManager = { id: "u-school", faculty: null, roleKey: null, permissions: ["access.manage"] as Permission[] };

describe("access.rule: phạm vi người quản lý phân quyền", () => {
  test("vai trò cao: vai trò hệ thống hoặc có quyền phân quyền", () => {
    assert.ok(isPrivilegedRole({ isSystem: true, permissions: [] }));
    assert.ok(isPrivilegedRole({ isSystem: false, permissions: ["access.manage"] }));
    assert.ok(!isPrivilegedRole(facultyRole));
  });

  test("người theo khoa chỉ thấy, sửa vai trò theo khoa; không thêm quyền toàn trường hay quyền mình không có", () => {
    assert.ok(roleVisibleTo(facultyManager, facultyRole));
    assert.ok(!roleVisibleTo(facultyManager, universityRole));
    assert.ok(roleVisibleTo(schoolManager, universityRole));
    assert.match(rolePermissionsBlockedReason(facultyManager, universityRole, ["dashboard.view"]) ?? "", /chỉ sửa được vai trò theo khoa/);
    assert.match(rolePermissionsBlockedReason(facultyManager, facultyRole, [...facultyRole.permissions, "settings.manage"]) ?? "", /toàn trường/);
    assert.match(rolePermissionsBlockedReason(facultyManager, facultyRole, [...facultyRole.permissions, "access.manage"]) ?? "", /toàn trường/);
    assert.match(rolePermissionsBlockedReason(facultyManager, facultyRole, [...facultyRole.permissions, "grades.approve"]) ?? "", /vai trò của bạn không có/);
    assert.equal(rolePermissionsBlockedReason(facultyManager, facultyRole, [...facultyRole.permissions, "advisors.assign"]), null);
    assert.equal(rolePermissionsBlockedReason(facultyManager, facultyRole, ["dashboard.view"]), null, "bỏ quyền thì được");
    assert.match(rolePermissionsBlockedReason(facultyManager, { ...facultyRole, permissions: ["access.manage"] }, ["access.manage"]) ?? "", /chỉ quản trị toàn trường/);
    assert.match(rolePermissionsBlockedReason(schoolManager, { ...universityRole, isSystem: true }, ["dashboard.view"]) ?? "", /Vai trò hệ thống/);
    assert.equal(rolePermissionsBlockedReason(schoolManager, universityRole, ["access.manage", "settings.manage"]), null);
  });

  test("cấp vai trò: không tự cấp; vai trò cao chỉ người toàn trường; người theo khoa chỉ cấp trong khoa mình", () => {
    assert.match(grantBlockedReason(schoolManager, universityRole, { userId: "u-school", faculty: null, targetFaculty: null }) ?? "", /chính mình/);
    assert.match(grantBlockedReason(facultyManager, { ...facultyRole, permissions: ["access.manage"] }, { userId: "x", faculty: "Khoa A", targetFaculty: "Khoa A" }) ?? "", /quản trị toàn trường/);
    assert.match(grantBlockedReason(facultyManager, universityRole, { userId: "x", faculty: null, targetFaculty: "Khoa A" }) ?? "", /theo khoa cho Khoa A/);
    assert.match(grantBlockedReason(facultyManager, facultyRole, { userId: "x", faculty: "Khoa B", targetFaculty: "Khoa A" }) ?? "", /theo khoa cho Khoa A/);
    assert.match(grantBlockedReason(facultyManager, facultyRole, { userId: "x", faculty: "Khoa A", targetFaculty: "Khoa B" }) ?? "", /thuộc Khoa A/);
    assert.equal(grantBlockedReason(facultyManager, facultyRole, { userId: "x", faculty: "Khoa A", targetFaculty: "Khoa A" }), null);
    assert.equal(grantBlockedReason(schoolManager, { ...universityRole, isSystem: true }, { userId: "x", faculty: null, targetFaculty: null }), null);
  });

  test("thu hồi và khóa tài khoản: không đụng vai trò cao hơn mình", () => {
    assert.match(revokeBlockedReason(schoolManager, universityRole, { userId: "u-school", faculty: null }) ?? "", /chính mình/);
    assert.match(revokeBlockedReason(facultyManager, universityRole, { userId: "x", faculty: null }) ?? "", /khoa khác hoặc toàn trường/);
    assert.equal(revokeBlockedReason(facultyManager, facultyRole, { userId: "x", faculty: "Khoa A" }), null);
    const systemRole = { name: "Quản trị hệ thống", scope: "university" as const, isSystem: true, permissions: ["access.manage"] as Permission[] };
    assert.match(lockBlockedReason(schoolManager, [systemRole]) ?? "", /chỉ quản trị hệ thống khóa được/);
    assert.match(lockBlockedReason(facultyManager, [{ ...universityRole, name: "Ban Giám hiệu" }]) ?? "", /Ban Giám hiệu/);
    assert.equal(lockBlockedReason({ ...schoolManager, roleKey: "system-admin" }, [systemRole]), null);
    assert.equal(lockBlockedReason(schoolManager, [{ ...universityRole, name: "Ban Giám hiệu" }]), null);
  });
});

describe("access.action: phân quyền trên DB qua server action", () => {
  const stamp = Date.now();
  const ids = { users: [] as string[], roles: [] as string[], staff: [] as string[], assignments: [] as string[] };
  let run: Awaited<ReturnType<typeof requestRunner>>;
  let access: typeof AccessAction;
  let accessQuery: typeof AccessQuery;
  let faculty: { id: string; name: string };
  let managerCookie = "";
  let adminCookie = "";
  let managerId = "";
  let adminId = "";
  let sameFacultyUser = "";
  let otherUnitUser = "";
  let editableRoleId = "";
  let managerRoleId = "";
  let systemRoleId = "";
  let headRoleId = "";
  let adminSystemAssignmentId = "";

  async function staffAccount(name: string, unit: string) {
    const [account] = await db.insert(user).values({ name, email: `access-test-${stamp}-${ids.users.length}@hcmue.edu.vn` }).returning({ id: user.id });
    ids.users.push(account.id);
    const [staff] = await db.insert(staffMembers).values({ userId: account.id, code: `TA${String(stamp).slice(-6)}${ids.users.length}`, fullName: name, unit, email: `access-staff-${stamp}-${ids.users.length}@hcmue.edu.vn` }).returning({ id: staffMembers.id });
    ids.staff.push(staff.id);
    return account.id;
  }

  async function testRole(name: string, scope: "faculty" | "university", permissions: Permission[]) {
    const [role] = await db.insert(roles).values({ name: `${name} ${stamp}`, scope }).returning({ id: roles.id });
    ids.roles.push(role.id);
    await db.insert(rolePermissions).values(permissions.map((permission) => ({ roleId: role.id, permission })));
    return role.id;
  }

  before(async () => {
    [run, access, accessQuery] = await Promise.all([requestRunner(), import("@/modules/access/access.action"), import("@/modules/access/access.query")]);
    [faculty] = await db.select({ id: faculties.id, name: faculties.name }).from(faculties).where(eq(faculties.name, "Khoa Công nghệ Thông tin"));
    [{ id: systemRoleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "system-admin"));
    [{ id: headRoleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "academic-head"));
    [{ id: adminId }] = await db.select({ id: user.id }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn"));
    [{ id: adminSystemAssignmentId }] = await db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, adminId), eq(roleAssignments.roleId, systemRoleId)));

    managerRoleId = await testRole("Thử quản lý phân quyền khoa", "faculty", ["access.manage", "dashboard.view", "students.view", "advisors.assign"]);
    editableRoleId = await testRole("Thử vai trò khoa", "faculty", ["dashboard.view"]);
    managerId = await staffAccount("Quản lý khoa thử", faculty.name);
    sameFacultyUser = await staffAccount("Cán bộ khoa thử", faculty.name);
    otherUnitUser = await staffAccount("Cán bộ phòng thử", "Phòng Đào tạo");
    await db.update(user).set({ role: "admin" }).where(eq(user.id, managerId));
    const [assignment] = await db.insert(roleAssignments).values({ userId: managerId, roleId: managerRoleId, facultyId: faculty.id }).returning({ id: roleAssignments.id });
    managerCookie = await cookieOf(managerId, assignment.id);
    adminCookie = await cookieOf(adminId, adminSystemAssignmentId);
  });

  after(async () => {
    const assignmentIds = (await db.select({ id: roleAssignments.id }).from(roleAssignments).where(inArray(roleAssignments.userId, ids.users))).map((row) => row.id);
    await db.delete(auditLogs).where(or(inArray(auditLogs.actorUserId, ids.users), inArray(auditLogs.entityId, [...assignmentIds, ...ids.assignments, ...ids.roles])));
    await db.delete(roleAssignments).where(inArray(roleAssignments.userId, ids.users));
    await db.delete(staffMembers).where(inArray(staffMembers.id, ids.staff));
    await deleteTestSessions();
    await db.delete(user).where(inArray(user.id, ids.users));
    await db.delete(roles).where(inArray(roles.id, ids.roles));
  });

  test("người theo khoa: trang Phân quyền chỉ thấy vai trò theo khoa và phân quyền trong khoa mình", async () => {
    const [visibleRoles, assignments] = await run(managerCookie, () => Promise.all([accessQuery.getRoles(), accessQuery.getRoleAssignments()]));
    assert.ok(visibleRoles.length > 0);
    assert.ok(visibleRoles.every((role) => role.scope === "faculty"));
    assert.ok(!visibleRoles.some((role) => role.id === systemRoleId));
    assert.ok(assignments.every((assignment) => assignment.faculty === faculty.name));
    const candidates = await run(managerCookie, () => accessQuery.getGrantCandidates());
    assert.ok(!candidates.some((candidate) => candidate.userId === managerId), "không thấy chính mình");
    assert.ok(candidates.some((candidate) => candidate.userId === sameFacultyUser));
    assert.ok(!candidates.some((candidate) => candidate.userId === otherUnitUser));
  });

  test("người theo khoa không sửa được vai trò toàn trường, vai trò hệ thống, không thêm quyền toàn trường", async () => {
    const [examOffice] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "exam-office"));
    const university = await run(managerCookie, () => access.saveRolePermissions(examOffice.id, ["dashboard.view"]));
    assert.ok(!university.ok && /chỉ sửa được vai trò theo khoa/.test(university.message));
    const system = await run(managerCookie, () => access.saveRolePermissions(systemRoleId, ["dashboard.view"]));
    assert.ok(!system.ok);
    const schoolWide = await run(managerCookie, () => access.saveRolePermissions(editableRoleId, ["dashboard.view", "access.manage"]));
    assert.ok(!schoolWide.ok && /toàn trường/.test(schoolWide.message));
    const own = await run(managerCookie, () => access.saveRolePermissions(managerRoleId, ["access.manage", "dashboard.view", "students.view", "advisors.assign", "students.manage"]));
    assert.ok(!own.ok, "không tự nâng vai trò của mình");
    const saved = await run(managerCookie, () => access.saveRolePermissions(editableRoleId, ["dashboard.view", "advisors.assign"]));
    assert.ok(saved.ok, saved.ok ? "" : saved.message);
    const stored = await db.select({ permission: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, editableRoleId));
    assert.deepEqual(stored.map((row) => row.permission).toSorted(), ["advisors.assign", "dashboard.view"]);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "role"), eq(auditLogs.entityId, editableRoleId)));
    assert.equal(audit?.action, "permission");
    assert.ok(audit.changes.some((change) => change.after === "Có"));
  });

  test("cấp vai trò: không tự cấp, không cấp vai trò cao, chỉ cho người trong khoa; cấp được thì có nhật ký", async () => {
    const self = await run(managerCookie, () => access.grantRole({ userId: managerId, roleId: editableRoleId, faculty: faculty.name }));
    assert.ok(!self.ok && /chính mình/.test(self.message));
    const privileged = await run(managerCookie, () => access.grantRole({ userId: sameFacultyUser, roleId: managerRoleId, faculty: faculty.name }));
    assert.ok(!privileged.ok && /quản trị toàn trường/.test(privileged.message));
    const system = await run(managerCookie, () => access.grantRole({ userId: sameFacultyUser, roleId: systemRoleId }));
    assert.ok(!system.ok);
    const outside = await run(managerCookie, () => access.grantRole({ userId: otherUnitUser, roleId: editableRoleId, faculty: faculty.name }));
    assert.ok(!outside.ok && /thuộc Khoa Công nghệ Thông tin/.test(outside.message));
    const granted = await run(managerCookie, () => access.grantRole({ userId: sameFacultyUser, roleId: editableRoleId, faculty: faculty.name }));
    assert.ok(granted.ok, granted.ok ? "" : granted.message);
    ids.assignments.push(granted.data.id);
    const [account] = await db.select({ role: user.role }).from(user).where(eq(user.id, sameFacultyUser));
    assert.equal(account.role, "admin");
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, granted.data.id));
    assert.equal(audit?.actorUserId, managerId);
    const revoked = await run(managerCookie, () => access.revokeRole(granted.data.id));
    assert.ok(revoked.ok);
    const [revokedAccount] = await db.select({ role: user.role }).from(user).where(eq(user.id, sameFacultyUser));
    assert.equal(revokedAccount.role, null, "hết vai trò thì bỏ admin");
    const audits = await db.select({ action: auditLogs.action, summary: auditLogs.summary }).from(auditLogs).where(eq(auditLogs.entityId, granted.data.id));
    assert.equal(audits.length, 2);
  });

  test("quản trị toàn trường: cấp được vai trò hệ thống cho người khác nhưng không tự cấp; không thu hồi quản trị hệ thống cuối cùng", async () => {
    const self = await run(adminCookie, () => access.grantRole({ userId: adminId, roleId: headRoleId }));
    assert.ok(!self.ok && /chính mình/.test(self.message));
    const granted = await run(adminCookie, () => access.grantRole({ userId: otherUnitUser, roleId: systemRoleId }));
    assert.ok(granted.ok, granted.ok ? "" : granted.message);
    ids.assignments.push(granted.data.id);
    assert.ok((await run(adminCookie, () => access.revokeRole(granted.data.id))).ok);
    // Người toàn trường khác (vai trò tự tạo có quyền phân quyền) thử thu hồi quản trị hệ thống duy nhất của seed.
    const schoolRoleId = await testRole("Thử phân quyền toàn trường", "university", ["access.manage", "dashboard.view"]);
    const [assignment] = await db.insert(roleAssignments).values({ userId: otherUnitUser, roleId: schoolRoleId }).returning({ id: roleAssignments.id });
    await db.update(user).set({ role: "admin" }).where(eq(user.id, otherUnitUser));
    const otherCookie = await cookieOf(otherUnitUser, assignment.id);
    const last = await run(otherCookie, () => access.revokeRole(adminSystemAssignmentId));
    assert.ok(!last.ok && /cuối cùng/.test(last.message));
    const [still] = await db.select({ id: roleAssignments.id }).from(roleAssignments).where(eq(roleAssignments.id, adminSystemAssignmentId));
    assert.ok(still);
  });

  test("tài khoản không có quyền phân quyền bị chặn ở server", async () => {
    const [head] = await db.select({ id: roleAssignments.id }).from(roleAssignments).where(and(eq(roleAssignments.userId, adminId), eq(roleAssignments.roleId, headRoleId)));
    const headCookie = await cookieOf(adminId, head.id);
    await expectForbidden(() => run(headCookie, () => access.grantRole({ userId: sameFacultyUser, roleId: editableRoleId, faculty: faculty.name })));
    await expectForbidden(() => run(headCookie, () => access.saveRolePermissions(editableRoleId, ["dashboard.view"])));
  });
});

describe("users.action: tài khoản cán bộ, khóa tài khoản quản trị, sửa tình trạng học tập", () => {
  const stamp = Date.now();
  const created = { users: [] as string[], staff: [] as string[], lecturers: [] as string[], students: [] as string[], classes: [] as string[], emails: [] as string[] };
  let run: Awaited<ReturnType<typeof requestRunner>>;
  let users: typeof UsersAction;
  let systemCookie = "";
  let headCookie = "";
  let examRoleId = "";
  let systemRoleId = "";

  before(async () => {
    [run, users] = await Promise.all([requestRunner(), import("@/modules/users/users.action")]);
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn"));
    const held = await db
      .select({ id: roleAssignments.id, key: roles.key })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .where(eq(roleAssignments.userId, admin.id));
    systemCookie = await cookieOf(admin.id, held.find((entry) => entry.key === "system-admin")!.id);
    headCookie = await cookieOf(admin.id, held.find((entry) => entry.key === "academic-head")!.id);
    [{ id: examRoleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "exam-office"));
    [{ id: systemRoleId }] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "system-admin"));
  });

  after(async () => {
    const staffUsers =
      created.staff.length > 0
        ? (await db.select({ userId: staffMembers.userId }).from(staffMembers).where(inArray(staffMembers.id, created.staff))).flatMap((row) => (row.userId ? [row.userId] : []))
        : [];
    const userIds = [...created.users, ...staffUsers];
    const entityIds = [...created.staff, ...created.lecturers, ...created.students];
    if (userIds.length > 0) {
      entityIds.push(...(await db.select({ id: roleAssignments.id }).from(roleAssignments).where(inArray(roleAssignments.userId, userIds))).map((row) => row.id));
      await db.delete(roleAssignments).where(inArray(roleAssignments.userId, userIds));
    }
    if (entityIds.length > 0) await db.delete(auditLogs).where(inArray(auditLogs.entityId, entityIds));
    if (created.emails.length > 0) await db.delete(mailOutbox).where(inArray(mailOutbox.recipient, created.emails));
    if (created.staff.length > 0) await db.delete(staffMembers).where(inArray(staffMembers.id, created.staff));
    if (created.lecturers.length > 0) await db.delete(lecturers).where(inArray(lecturers.id, created.lecturers));
    if (created.students.length > 0) await db.delete(students).where(inArray(students.id, created.students));
    if (created.classes.length > 0) await db.delete(administrativeClasses).where(inArray(administrativeClasses.id, created.classes));
    await deleteTestSessions();
    if (userIds.length > 0) await db.delete(user).where(inArray(user.id, userIds));
  });

  function staffInput(suffix: string, extra: Record<string, unknown> = {}) {
    const email = `cbthu${stamp}${suffix}@hcmue.edu.vn`;
    created.emails.push(email);
    return { code: `CT${String(stamp).slice(-6)}${suffix}`, fullName: `Cán bộ thử ${suffix}`, unit: "Phòng Đào tạo", email, provisionAccount: true, ...extra };
  }

  test("tạo cán bộ không chọn vai trò: tài khoản không mang vai trò admin (không vòng lặp 403); chọn vai trò thì cấp luôn", async () => {
    const plain = await run(systemCookie, () => users.createStaffMember(staffInput("1")));
    assert.ok(plain.ok, plain.ok ? "" : plain.message);
    created.staff.push(plain.data.id);
    const [plainRow] = await db.select({ role: user.role, userId: user.id }).from(staffMembers).innerJoin(user, eq(user.id, staffMembers.userId)).where(eq(staffMembers.id, plain.data.id));
    assert.equal(plainRow.role, null);
    assert.equal((await db.select().from(roleAssignments).where(eq(roleAssignments.userId, plainRow.userId))).length, 0);
    const [staffAudit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, plain.data.id), eq(auditLogs.entityType, "staff")));
    assert.ok(staffAudit, "nhật ký tạo cán bộ dùng entityType staff");

    const withRole = await run(systemCookie, () => users.createStaffMember(staffInput("2", { roleId: examRoleId })));
    assert.ok(withRole.ok, withRole.ok ? "" : withRole.message);
    created.staff.push(withRole.data.id);
    assert.equal(withRole.data.roleName, "Phòng Khảo thí");
    const [roleRow] = await db.select({ role: user.role, userId: user.id }).from(staffMembers).innerJoin(user, eq(user.id, staffMembers.userId)).where(eq(staffMembers.id, withRole.data.id));
    assert.equal(roleRow.role, "admin");
    assert.equal((await db.select().from(roleAssignments).where(eq(roleAssignments.userId, roleRow.userId))).length, 1);

    await expectForbidden(() => run(headCookie, () => users.createStaffMember(staffInput("3"))));
  });

  test("tài khoản cán bộ: khóa, mở khóa, gửi lại thư, sửa đơn vị; chỉ người phân quyền toàn trường làm được", async () => {
    const [staff] = created.staff;
    const locked = await run(systemCookie, () => users.setAccountLock({ kind: "staff", ids: [staff], locked: true }));
    assert.ok(locked.ok, locked.ok ? "" : locked.message);
    assert.equal(locked.data.accounts[staff].status, "locked");
    const unlocked = await run(systemCookie, () => users.setAccountLock({ kind: "staff", ids: [staff], locked: false }));
    assert.ok(unlocked.ok && unlocked.data.accounts[staff].status === "pending");
    const resent = await run(systemCookie, () => users.resendActivation({ kind: "staff", ids: [staff] }));
    assert.ok(resent.ok && resent.data.mailed === 1);
    const updated = await run(systemCookie, () => users.updateStaffMember(staff, { fullName: "Cán bộ thử đã sửa", unit: "Phòng Khảo thí", email: created.emails[0] }));
    assert.ok(updated.ok && updated.data.unit === "Phòng Khảo thí");
    await expectForbidden(() => run(headCookie, () => users.setAccountLock({ kind: "staff", ids: [staff], locked: true })));
  });

  test("giảng viên đang giữ vai trò quản trị hệ thống: người chỉ có quyền quản lý giảng viên không khóa được", async () => {
    const [faculty] = await db.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, "Khoa Công nghệ Thông tin"));
    const email = `gvthu${stamp}@hcmue.edu.vn`;
    const [account] = await db.insert(user).values({ name: "ThS. Giảng viên thử", email, role: "lecturer,admin" }).returning({ id: user.id });
    created.users.push(account.id);
    const [lecturer] = await db
      .insert(lecturers)
      .values({ userId: account.id, code: `GT${String(stamp).slice(-6)}`, fullName: "Giảng viên thử", title: "ThS.", gender: "male", facultyId: faculty.id, email })
      .returning({ id: lecturers.id });
    created.lecturers.push(lecturer.id);
    await db.insert(roleAssignments).values({ userId: account.id, roleId: systemRoleId });
    const blocked = await run(headCookie, () => users.setAccountLock({ kind: "lecturer", ids: [lecturer.id], locked: true }));
    assert.ok(!blocked.ok && /chỉ quản trị hệ thống khóa được/.test(blocked.message));
    const [stillOpen] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, account.id));
    assert.ok(!stillOpen.banned);
    const locked = await run(systemCookie, () => users.setAccountLock({ kind: "lecturer", ids: [lecturer.id], locked: true }));
    assert.ok(locked.ok, locked.ok ? "" : locked.message);
  });

  test("tình trạng học tập: chỉ quản trị hệ thống sửa tay, phải có lý do, có nhật ký", async () => {
    const [major] = await db.select({ id: majors.id }).from(majors).where(eq(majors.code, "104"));
    const [homeClass] = await db.insert(administrativeClasses).values({ code: `TEST-ST-${stamp}`, majorId: major.id, cohort: 95 }).returning({ id: administrativeClasses.id });
    created.classes.push(homeClass.id);
    const [student] = await db
      .insert(students)
      .values({ code: `TEST-ST-${stamp}`, fullName: "Sinh viên thử tình trạng", gender: "female", dateOfBirth: "2008-01-01", email: `test-st-${stamp}@student.hcmue.edu.vn`, administrativeClassId: homeClass.id, status: "reserved" })
      .returning({ id: students.id });
    created.students.push(student.id);
    const reason = "Sửa dữ liệu nhập sai từ hệ thống cũ";
    const byHead = await run(headCookie, () => users.overrideStudentsStatus({ ids: [student.id], status: "studying", reason }));
    assert.ok(!byHead.ok && /Chỉ quản trị hệ thống/.test(byHead.message));
    const noReason = await run(systemCookie, () => users.overrideStudentsStatus({ ids: [student.id], status: "studying", reason: "sai" }));
    assert.ok(!noReason.ok && noReason.fieldErrors?.reason);
    const done = await run(systemCookie, () => users.overrideStudentsStatus({ ids: [student.id], status: "studying", reason }));
    assert.ok(done.ok && done.data.updated === 1);
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "student"), eq(auditLogs.entityId, student.id)));
    assert.match(audit.summary, /Sửa dữ liệu nhập sai/);
    assert.deepEqual(audit.changes[0], { field: "Tình trạng", before: "Bảo lưu", after: "Đang học" });
  });
});
