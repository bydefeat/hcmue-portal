import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, asc, eq, inArray, isNotNull, like, ne } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { auditLogs } from "@/modules/audit/audit.schema";
import { user } from "@/modules/authentication/authentication.schema";
import { majors } from "@/modules/curriculum/curriculum.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { REQUESTS_CONSTRAINT_MESSAGE } from "@/modules/requests/requests.constant";
import {
  decideStep,
  insertRequest,
  officeHandlerUserIds,
  reassignStep,
  REQUEST_APPROVED_HANDLERS,
  requestSupplement,
  requestsVisibleTo,
  runRequestSlaJob,
  submitSupplement,
} from "@/modules/requests/requests.lib";
import {
  addWorkingDays,
  effectiveAssignee,
  gradeChangeSheetBlockedReason,
  holidayDates,
  missingAttachmentReason,
  overloadBlockedReason,
  pickFinalComponent,
  regradeBlockedReason,
  requestKindDescription,
  slaNotice,
  stepDeniedReason,
  superviseDeniedReason,
  type RequestAccess,
} from "@/modules/requests/requests.rule";
import { academicRequests, requestCodeCounters, requestSteps, requestSupplements } from "@/modules/requests/requests.schema";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";

const YEAR = 2097;
const createdIds: string[] = [];
const createdRoleIds: string[] = [];
const createdUserIds: string[] = [];
let student = { id: "", userId: "", advisorId: "", advisorUserId: "", facultyId: "" };
let otherLecturer = { id: "", userId: "" as string | null };
let otherFacultyId = "";
const actor = { userId: null, name: "Phòng Đào tạo kiểm thử", role: "Kiểm thử" };

before(async () => {
  const [row] = await db
    .select({ id: students.id, userId: students.userId, advisorId: administrativeClasses.advisorId, advisorUserId: lecturers.userId, facultyId: majors.facultyId })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(lecturers, eq(lecturers.id, administrativeClasses.advisorId))
    .where(eq(students.code, "5001104013"));
  student = { id: row.id, userId: row.userId!, advisorId: row.advisorId!, advisorUserId: row.advisorUserId!, facultyId: row.facultyId };
  const [other] = await db
    .select({ id: lecturers.id, userId: lecturers.userId })
    .from(lecturers)
    .where(and(ne(lecturers.id, student.advisorId), eq(lecturers.status, "active")))
    .limit(1);
  otherLecturer = other;
  const [faculty] = await db.select({ id: majors.facultyId }).from(majors).where(ne(majors.facultyId, student.facultyId)).limit(1);
  otherFacultyId = faculty.id;
});

after(async () => {
  for (const handler of Object.keys(REQUEST_APPROVED_HANDLERS)) delete REQUEST_APPROVED_HANDLERS[handler as keyof typeof REQUEST_APPROVED_HANDLERS];
  if (createdIds.length > 0) await db.delete(academicRequests).where(inArray(academicRequests.id, createdIds));
  if (createdRoleIds.length > 0) {
    await db.delete(roleAssignments).where(inArray(roleAssignments.roleId, createdRoleIds));
    await db.delete(roles).where(inArray(roles.id, createdRoleIds));
  }
  if (createdUserIds.length > 0) await db.delete(user).where(inArray(user.id, createdUserIds));
  await db.delete(requestCodeCounters).where(eq(requestCodeCounters.year, YEAR));
  await db.delete(notifications).where(like(notifications.title, `Đơn DT-${YEAR}-%`));
  await db.delete(auditLogs).where(like(auditLogs.entityLabel, `DT-${YEAR}-%`));
  await db.$client.end();
});

async function newOverload() {
  const request = await db.transaction((tx) =>
    insertRequest(
      tx,
      {
        kind: "overload",
        requester: { type: "student", studentId: student.id },
        facultyId: student.facultyId,
        subject: "Học vượt tín chỉ",
        details: [{ label: "Số tín chỉ xin đăng ký", value: "28" }],
        reason: "Kiểm thử quy trình",
        attachments: [],
        lecturerAssigneeId: null,
        actor: { userId: student.userId, name: "Sinh viên kiểm thử", role: "Sinh viên" },
      },
      YEAR,
    ),
  );
  createdIds.push(request.id);
  return request;
}

const stepsOf = (requestId: string) => db.select().from(requestSteps).where(eq(requestSteps.requestId, requestId)).orderBy(asc(requestSteps.position));
const notificationsTo = (userId: string, code: string) =>
  db
    .select({ title: notifications.title, audience: notifications.audience, href: notifications.href })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), like(notifications.title, `Đơn ${code} %`)));

const dueStep = (dueAt: string, flags: { dueSoon?: Date; overdue?: Date } = {}) => ({ dueAt: new Date(dueAt), dueSoonNotifiedAt: flags.dueSoon ?? null, overdueNotifiedAt: flags.overdue ?? null });

const office = (value: Partial<NonNullable<RequestAccess["office"]>>): RequestAccess => ({
  userId: "0192f3a4-0000-7000-8000-0000000000ff",
  lecturerId: null,
  office: { roles: [], faculty: null, supervise: false, roleName: "Vai trò thử", ...value },
});

describe("requests: hàm quyền thuần", () => {
  test("người chịu trách nhiệm bước đi theo cố vấn, giảng viên hiện tại; đã xử lý hoặc đã chuyển thì giữ người đã lưu", () => {
    const context = { advisorId: "co-van-moi", sectionLecturerId: "gv-moi" };
    assert.equal(effectiveAssignee({ role: "advisor", status: "pending", assigneeLecturerId: null, reassignedAt: null }, context), "co-van-moi");
    assert.equal(effectiveAssignee({ role: "advisor", status: "approved", assigneeLecturerId: "co-van-cu", reassignedAt: null }, context), "co-van-cu");
    assert.equal(effectiveAssignee({ role: "advisor", status: "pending", assigneeLecturerId: "nguoi-duoc-chuyen", reassignedAt: new Date() }, context), "nguoi-duoc-chuyen");
    assert.equal(effectiveAssignee({ role: "lecturer", status: "waiting", assigneeLecturerId: "gv-cu", reassignedAt: null }, context), "gv-moi");
    assert.equal(effectiveAssignee({ role: "lecturer", status: "pending", assigneeLecturerId: "gv-cu", reassignedAt: null }, { advisorId: null, sectionLecturerId: null }), "gv-cu");
    assert.equal(effectiveAssignee({ role: "faculty", status: "pending", assigneeLecturerId: null, reassignedAt: null }, context), null);
  });

  test("xử lý bước: giảng viên đúng người, cán bộ đúng quyền bước và phạm vi khoa; Phòng Đào tạo xử lý thay trong phạm vi", () => {
    const step = { role: "faculty" as const, assigneeLecturerId: null, faculty: "Khoa A", advisorId: null };
    assert.equal(stepDeniedReason(office({ roles: ["faculty"] }), "office", step), null);
    assert.match(stepDeniedReason(office({ roles: ["academic-office"] }), "office", step) ?? "", /không xử lý được/);
    assert.match(stepDeniedReason(office({ roles: ["faculty"], faculty: "Khoa B" }), "office", step) ?? "", /ngoài phạm vi/);
    const advisorStep = { role: "advisor" as const, assigneeLecturerId: "gv-1", faculty: "Khoa A", advisorId: "gv-1" };
    assert.equal(stepDeniedReason({ userId: "u", lecturerId: "gv-1", office: null }, "lecturer", advisorStep), null);
    assert.ok(stepDeniedReason({ userId: "u", lecturerId: "gv-2", office: null }, "lecturer", advisorStep));
    assert.match(stepDeniedReason(office({ roles: ["faculty"] }), "office", advisorStep) ?? "", /cổng giảng viên/);
    assert.ok(stepDeniedReason({ userId: "u", lecturerId: "gv-1", office: null }, "lecturer", { ...advisorStep, assigneeLecturerId: null }));
    assert.equal(superviseDeniedReason(office({ supervise: true }), "Khoa A"), null);
    assert.ok(superviseDeniedReason(office({ supervise: true, faculty: "Khoa B" }), "Khoa A"));
    assert.ok(superviseDeniedReason(office({ roles: ["faculty", "academic-office", "exam-office"] }), "Khoa A"));
  });

  test("hạn xử lý theo ngày làm việc: bỏ thứ 7, chủ nhật và ngày nghỉ lễ", () => {
    assert.equal(addWorkingDays(new Date("2026-10-23T08:00:00Z"), 3).toISOString(), "2026-10-28T08:00:00.000Z");
    assert.equal(addWorkingDays(new Date("2026-10-23T08:00:00Z"), 3, holidayDates([{ startDate: "2026-10-26", endDate: "2026-10-26" }])).toISOString(), "2026-10-29T08:00:00.000Z");
    assert.equal(addWorkingDays(new Date("2026-10-24T03:00:00Z"), 1).toISOString(), "2026-10-26T03:00:00.000Z");
    assert.deepEqual([...holidayDates([{ startDate: "2027-04-30", endDate: "2027-05-02" }])], ["2027-04-30", "2027-05-01", "2027-05-02"]);
  });

  test("nhắc hạn: sắp hết hạn dưới 24 giờ, quá hạn, mỗi loại một lần", () => {
    const now = new Date("2026-10-20T08:00:00Z");
    assert.equal(slaNotice(dueStep("2026-10-21T07:00:00Z"), now), "due-soon");
    assert.equal(slaNotice(dueStep("2026-10-21T07:00:00Z", { dueSoon: now }), now), null);
    assert.equal(slaNotice(dueStep("2026-10-22T08:00:00Z"), now), null);
    assert.equal(slaNotice(dueStep("2026-10-20T07:00:00Z", { dueSoon: now }), now), "overdue");
    assert.equal(slaNotice(dueStep("2026-10-20T07:00:00Z", { overdue: now }), now), null);
  });

  test("điều kiện gửi đơn theo quy chế", () => {
    const rules = { maxPerTerm: 25, overloadMinCpa: 2.5, overloadExtraCredits: 5, regradeWindowDays: 7, maxReserveTerms: 2 };
    assert.equal(overloadBlockedReason({ credits: 28, cpa4: 3.1 }, rules), null);
    assert.equal(overloadBlockedReason({ credits: 29, cpa4: 3.1 }, { ...rules, overloadExtraCredits: 3 })?.field, "credits");
    assert.equal(overloadBlockedReason({ credits: 28, cpa4: 2.1 }, rules)?.field, "kind");
    assert.equal(overloadBlockedReason({ credits: 25, cpa4: 3.1 }, rules)?.field, "credits");
    assert.equal(overloadBlockedReason({ credits: 31, cpa4: 3.1 }, { ...rules, maxPerTerm: 25 })?.field, "credits");
    const now = new Date("2026-10-20T08:00:00Z");
    assert.match(regradeBlockedReason({ status: "approved", publishedAt: null }, now, 7) ?? "", /chưa công bố điểm/);
    assert.match(regradeBlockedReason(null, now, 7) ?? "", /chưa công bố điểm/);
    assert.equal(regradeBlockedReason({ status: "published", publishedAt: new Date("2026-10-15T08:00:00Z") }, now, 7), null);
    assert.match(regradeBlockedReason({ status: "published", publishedAt: new Date("2026-10-10T08:00:00Z") }, now, 7) ?? "", /quá hạn phúc khảo/);
    assert.ok(gradeChangeSheetBlockedReason("draft"));
    assert.ok(gradeChangeSheetBlockedReason("returned"));
    assert.ok(gradeChangeSheetBlockedReason(null));
    assert.equal(gradeChangeSheetBlockedReason("locked"), null);
    assert.equal(gradeChangeSheetBlockedReason("published"), null);
    assert.match(missingAttachmentReason("exam-postpone", 0) ?? "", /bắt buộc kèm/);
    assert.match(missingAttachmentReason("grade-change", 0) ?? "", /bắt buộc kèm/);
    assert.equal(missingAttachmentReason("exam-postpone", 1), null);
    assert.equal(missingAttachmentReason("transcript", 0), null);
    assert.match(requestKindDescription("overload", { ...rules, maxPerTerm: 24, overloadMinCpa: 2.8 }), /24 tín chỉ.*2,8/);
    assert.match(requestKindDescription("regrade", { ...rules, regradeWindowDays: 10 }), /10 ngày/);
    assert.match(requestKindDescription("reserve", { ...rules, maxReserveTerms: 3 }), /tối đa 3 học kỳ/);
  });

  test("cột cuối kỳ tìm theo khóa hoặc nhãn, không phân định được thì null", () => {
    assert.equal(pickFinalComponent([{ key: "mid", label: "Giữa kỳ" }, { key: "final", label: "Cuối kỳ" }])?.key, "final");
    assert.equal(pickFinalComponent([{ key: "gk", label: "Giữa kỳ" }, { key: "ck", label: "Thi cuối kỳ" }])?.key, "ck");
    assert.equal(pickFinalComponent([{ key: "a", label: "Bài tập" }, { key: "b", label: "Đồ án" }]), null);
    assert.equal(pickFinalComponent([{ key: "x", label: "Cuối kỳ lý thuyết" }, { key: "y", label: "Cuối kỳ thực hành" }]), null);
  });
});

describe("requests: quyền xem, thông báo người xử lý", () => {
  test("gửi đơn báo cố vấn; danh sách chỉ hiện đơn người xem có bước, cùng hàm quyền cho chi tiết", async () => {
    const request = await newOverload();
    const toAdvisor = await notificationsTo(student.advisorUserId, request.code);
    assert.equal(toAdvisor.length, 1);
    assert.equal(toAdvisor[0].audience, "lecturer");
    assert.equal(toAdvisor[0].href, `/lecturer/requests?open=${request.id}`);
    const [asAdvisor] = await requestsVisibleTo({ userId: student.advisorUserId, lecturerId: student.advisorId, office: null }, "lecturer", request.id);
    assert.ok(asAdvisor?.can.decide);
    assert.equal(asAdvisor.steps[0].assigneeId, student.advisorId);
    assert.equal((await requestsVisibleTo({ userId: "0192f3a4-0000-7000-8000-0000000000ee", lecturerId: otherLecturer.id, office: null }, "lecturer", request.id)).length, 0);
    assert.equal((await requestsVisibleTo(office({ roles: [] }), "office", request.id)).length, 0);
    assert.equal((await requestsVisibleTo(office({ roles: ["exam-office"] }), "office", request.id)).length, 0);
    const [asFaculty] = await requestsVisibleTo(office({ roles: ["faculty"] }), "office", request.id);
    assert.ok(asFaculty && !asFaculty.can.decide);
    const [, otherFaculty] = [null, await requestsVisibleTo(office({ roles: ["faculty"], faculty: "Khoa không tồn tại" }), "office", request.id)];
    assert.equal(otherFaculty.length, 0);
    const [asSupervisor] = await requestsVisibleTo(office({ supervise: true }), "office", request.id);
    assert.ok(asSupervisor?.can.supervise && asSupervisor.can.reassign);
    const [own] = await requestsVisibleTo({ userId: student.userId, lecturerId: null, office: null }, "own", request.id);
    assert.ok(own?.can.cancel);
  });

  test("duyệt bước cố vấn thì báo cán bộ có quyền bước khoa trong đúng phạm vi; ghi nhật ký; giữ người xử lý lúc duyệt", async () => {
    const request = await newOverload();
    await db.transaction((tx) =>
      decideStep(tx, { requestId: request.id, step: 0, decision: "approved", comment: "", actor: { userId: student.advisorUserId, name: "Cố vấn", role: "Giảng viên" }, authorize: () => null }),
    );
    const handlers = await officeHandlerUserIds(db, "faculty", student.facultyId);
    assert.ok(handlers.length > 0, "dữ liệu mẫu có cán bộ xử lý bước khoa (Trưởng phòng Đào tạo)");
    for (const userId of handlers) {
      const rows = await notificationsTo(userId, request.code);
      assert.ok(rows.some((row) => row.audience === "administrator" && row.href === `/administrator/requests?open=${request.id}` && row.title.endsWith("chờ bạn xử lý")));
    }
    const [step] = await stepsOf(request.id);
    assert.equal(step.assigneeLecturerId, student.advisorId);
    const logs = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entityId, request.id));
    assert.deepEqual(logs.map((row) => row.action).toSorted(), ["approve", "create"]);
  });

  test("vai trò tự tạo có quyền bước khoa theo phạm vi khoa nhận thông báo; khoa khác thì không", async () => {
    const [role] = await db.insert(roles).values({ name: `Thư ký khoa thử ${Date.now()}`, scope: "faculty" }).returning({ id: roles.id });
    createdRoleIds.push(role.id);
    await db.insert(rolePermissions).values([
      { roleId: role.id, permission: "requests.process" },
      { roleId: role.id, permission: "requests.step.faculty" },
    ]);
    const [someone] = await db.insert(user).values({ name: "Thư ký khoa thử", email: `request-test-${Date.now()}@hcmue.edu.vn`, role: "admin" }).returning({ id: user.id });
    createdUserIds.push(someone.id);
    await db.insert(roleAssignments).values({ userId: someone.id, roleId: role.id, facultyId: student.facultyId });
    await db.insert(roleAssignments).values({ userId: student.advisorUserId, roleId: role.id, facultyId: student.facultyId });
    assert.ok(!(await officeHandlerUserIds(db, "faculty", student.facultyId)).includes(student.advisorUserId));
    assert.ok((await officeHandlerUserIds(db, "faculty", student.facultyId)).includes(someone.id));
    assert.ok(!(await officeHandlerUserIds(db, "faculty", otherFacultyId)).includes(someone.id));
    assert.ok(!(await officeHandlerUserIds(db, "academic-office", student.facultyId)).includes(someone.id));
  });
});

describe("requests: bước kẹt, chuyển người, xử lý thay", () => {
  test("chuyển bước cố vấn cho giảng viên khác: người mới nhận thông báo và xử lý được, cố vấn cũ thì không", async () => {
    const request = await newOverload();
    await db.transaction((tx) => reassignStep(tx, { requestId: request.id, step: 0, lecturerId: otherLecturer.id, reason: "Cố vấn nghỉ phép dài ngày", actor, authorize: () => null }));
    const [step] = await stepsOf(request.id);
    assert.equal(step.assigneeLecturerId, otherLecturer.id);
    assert.ok(step.reassignedAt && step.reassignReason === "Cố vấn nghỉ phép dài ngày");
    if (otherLecturer.userId) assert.equal((await notificationsTo(otherLecturer.userId, request.code)).filter((row) => row.title.includes("được chuyển")).length, 1);
    const [asNew] = await requestsVisibleTo({ userId: otherLecturer.userId ?? "0192f3a4-0000-7000-8000-0000000000dd", lecturerId: otherLecturer.id, office: null }, "lecturer", request.id);
    assert.ok(asNew?.can.decide);
    assert.equal(asNew.steps[0].reassigned?.reason, "Cố vấn nghỉ phép dài ngày");
    assert.equal((await requestsVisibleTo({ userId: student.advisorUserId, lecturerId: student.advisorId, office: null }, "lecturer", request.id)).length, 0);
    await assert.rejects(
      db.transaction((tx) => reassignStep(tx, { requestId: request.id, step: 1, lecturerId: otherLecturer.id, reason: "x", actor, authorize: () => null })),
      /giao theo quyền của đơn vị/,
    );
  });

  test("Phòng Đào tạo xử lý thay bước kẹt và bỏ qua bước: ghi rõ xử lý thay, lý do bắt buộc, DB chặn bỏ qua không phải xử lý thay", async () => {
    const request = await newOverload();
    await assert.rejects(db.transaction((tx) => decideStep(tx, { requestId: request.id, step: 0, decision: "skipped", comment: "x", actor, authorize: () => null })), /xử lý thay/);
    await db.transaction((tx) => decideStep(tx, { requestId: request.id, step: 0, decision: "skipped", comment: "Lớp không còn cố vấn", onBehalf: true, actor, authorize: () => null }));
    const [skipped, next] = await stepsOf(request.id);
    assert.equal(skipped.status, "skipped");
    assert.ok(skipped.onBehalf && skipped.comment === "Lớp không còn cố vấn");
    assert.equal(next.status, "pending");
    const [view] = await requestsVisibleTo(office({ supervise: true }), "office", request.id);
    assert.equal(view.status, "in-review");
    assert.ok(view.steps[0].onBehalf);
    const error = await db
      .update(requestSteps)
      .set({ status: "skipped", actedAt: new Date(), actorName: "A", comment: "x" })
      .where(eq(requestSteps.id, next.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, REQUESTS_CONSTRAINT_MESSAGE), REQUESTS_CONSTRAINT_MESSAGE.request_steps_skipped_on_behalf);
  });
});

describe("requests: bổ sung minh chứng, gửi lại, điểm móc duyệt xong", () => {
  test("yêu cầu bổ sung: đơn cần bổ sung, bước dừng xử lý; người gửi bổ sung thì bước tính hạn lại, người xử lý nhận báo", async () => {
    const request = await newOverload();
    await db.transaction((tx) => requestSupplement(tx, { requestId: request.id, step: 0, note: "Bổ sung kế hoạch học tập", actor, authorize: () => null }));
    const [pending] = await requestsVisibleTo({ userId: student.userId, lecturerId: null, office: null }, "own", request.id);
    assert.equal(pending.status, "needs-info");
    assert.ok(pending.can.supplement);
    assert.equal(pending.openSupplement?.requestNote, "Bổ sung kế hoạch học tập");
    await assert.rejects(db.transaction((tx) => decideStep(tx, { requestId: request.id, step: 0, decision: "approved", comment: "", actor, authorize: () => null })), /chờ người gửi bổ sung/);
    await assert.rejects(
      db.transaction((tx) => submitSupplement(tx, { requestId: request.id, userId: student.advisorUserId, note: "x", attachments: [], actor, existingFiles: 0 })),
      /Chỉ người gửi/,
    );
    await db.transaction((tx) => submitSupplement(tx, { requestId: request.id, userId: student.userId, note: "Đã bổ sung kế hoạch", attachments: [], actor, existingFiles: 0 }));
    const [done] = await db.select().from(requestSupplements).where(eq(requestSupplements.requestId, request.id));
    assert.ok(done.respondedAt && done.responseNote === "Đã bổ sung kế hoạch");
    const [resumed] = await requestsVisibleTo({ userId: student.userId, lecturerId: null, office: null }, "own", request.id);
    assert.equal(resumed.status, "pending");
    assert.ok((await notificationsTo(student.advisorUserId, request.code)).some((row) => row.title.endsWith("đã được bổ sung")));
  });

  test("duyệt bước cuối gọi điểm móc theo loại đơn trong cùng transaction; handler lỗi thì lần duyệt rollback", async () => {
    const request = await newOverload();
    const called: string[] = [];
    REQUEST_APPROVED_HANDLERS.overload = async (approved) => {
      called.push(approved.code);
      if (called.length === 1) throw new Error("handler lỗi");
    };
    const approve = (step: number) => db.transaction((tx) => decideStep(tx, { requestId: request.id, step, decision: "approved", comment: "", actor, authorize: () => null }));
    await approve(0);
    await approve(1);
    assert.deepEqual(called, []);
    await assert.rejects(approve(2), /handler lỗi/);
    assert.equal((await stepsOf(request.id))[2].status, "pending");
    await approve(2);
    assert.deepEqual(called, [request.code, request.code]);
    assert.equal((await stepsOf(request.id))[2].status, "approved");
    delete REQUEST_APPROVED_HANDLERS.overload;
  });

  test("đơn bị từ chối: người gửi thấy nút gửi lại; đã gửi lại thì không gửi thêm lần nữa", async () => {
    const request = await newOverload();
    await db.transaction((tx) => decideStep(tx, { requestId: request.id, step: 0, decision: "rejected", comment: "Thiếu kế hoạch", actor, authorize: () => null }));
    const [rejected] = await requestsVisibleTo({ userId: student.userId, lecturerId: null, office: null }, "own", request.id);
    assert.ok(rejected.can.resubmit);
    const again = await db.transaction((tx) =>
      insertRequest(
        tx,
        {
          kind: "overload",
          requester: { type: "student", studentId: student.id },
          facultyId: student.facultyId,
          resubmittedFromId: request.id,
          subject: "Học vượt tín chỉ",
          details: [],
          reason: "Gửi lại",
          attachments: [],
          lecturerAssigneeId: null,
        },
        YEAR,
      ),
    );
    createdIds.push(again.id);
    const [old] = await requestsVisibleTo({ userId: student.userId, lecturerId: null, office: null }, "own", request.id);
    assert.equal(old.resubmittedAs?.code, again.code);
    assert.ok(!old.can.resubmit);
    const duplicate = await db
      .insert(academicRequests)
      .values({ code: `DT-${YEAR}-99999`, kind: "overload", requesterStudentId: student.id, facultyId: student.facultyId, resubmittedFromId: request.id, subject: "x", reason: "x" })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(duplicate, REQUESTS_CONSTRAINT_MESSAGE), REQUESTS_CONSTRAINT_MESSAGE.academic_requests_resubmitted_from_unique);
  });
});

describe("requests: nhắc hạn", () => {
  test("tác vụ request-sla báo bước quá hạn đúng một lần", async () => {
    const request = await newOverload();
    await db
      .update(requestSteps)
      .set({ dueAt: new Date(Date.now() - 3_600_000) })
      .where(and(eq(requestSteps.requestId, request.id), eq(requestSteps.status, "pending")));
    const first = await runRequestSlaJob(new Date(), [request.id]);
    assert.ok(first.overdue >= 1);
    const overdue = (await notificationsTo(student.advisorUserId, request.code)).filter((row) => row.title.endsWith("đã quá hạn xử lý"));
    assert.equal(overdue.length, 1);
    await runRequestSlaJob(new Date(), [request.id]);
    assert.equal((await notificationsTo(student.advisorUserId, request.code)).filter((row) => row.title.endsWith("đã quá hạn xử lý")).length, 1);
    const [step] = await db.select().from(requestSteps).where(and(eq(requestSteps.requestId, request.id), isNotNull(requestSteps.overdueNotifiedAt)));
    assert.ok(step);
  });
});
