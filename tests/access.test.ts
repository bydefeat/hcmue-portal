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
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { staffMembers } from "@/modules/users/users.schema";
// Chỉ lấy kiểu: action, query nạp động sau khi dựng môi trường request của Next (installNextRuntime).
import type * as AccessAction from "@/modules/access/access.action";
import type * as AccessQuery from "@/modules/access/access.query";

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
    // Pha "action" và incrementalCache giả để revalidatePath trong action chạy được (chỉ ghi vào pendingRevalidatedTags).
    const workStore = { route: "/test", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, incrementalCache: {} } as never;
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
    await db.$client.end();
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
