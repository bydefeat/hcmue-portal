import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, asc, desc, eq, gt, inArray, lte, notInArray, sql, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { newStorageKey } from "@/shared/libs/storage.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { EXAMS_CONSTRAINT_MESSAGE } from "@/modules/exams/exams.constant";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import {
  assignCandidates,
  byVietnameseName,
  canSubmitPaper,
  checkExamPaperFiles,
  ELIGIBILITY_OVERRIDE_SCHEMA,
  EXAM_PAPER_RETURN_SCHEMA,
  EXAM_PAPER_SUBMIT_SCHEMA,
  EXAM_SESSION_CREATE_SCHEMA,
  EXAM_SESSION_UPDATE_SCHEMA,
  examConflicts,
  isBannedFromExam,
  paperReviewBlockedReason,
  paperSubmitBlockedReason,
  periodsLeftBeforeBan,
  PROCTOR_SWAP_SCHEMA,
  slotsOverlap,
} from "@/modules/exams/exams.rule";
import {
  createSession,
  decidePaperReview,
  decideProctorSwap,
  ExamInputError,
  publishDrafts,
  recordPaperSubmission,
  refreshExamStatuses,
  replaceSessionRooms,
  unlockApprovedPaper,
  updateSession,
  type PaperUpload,
} from "@/modules/exams/exams.lib";
import { ALL_PERMISSIONS } from "@/modules/access/access.constant";
import { ROLES } from "@/modules/access/access.mock";
import type { Viewer } from "@/modules/access/access.type";
import { user } from "@/modules/authentication/authentication.schema";
import { auditLogs } from "@/modules/audit/audit.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { classSessions } from "@/modules/schedule/schedule.schema";
import { examCandidates, examEligibilityOverrides, examProctors, examProctorSwapRequests, examSessions } from "@/modules/exams/exams.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { lecturers } from "@/modules/users/users.schema";
import { CURRENT_STUDENT_ID } from "@/modules/users/users.mock";

after(() => db.$client.end());

const failure = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught);

const ID = "0192f3a4-0000-7000-8000-000000000001";
const OTHER = "0192f3a4-0000-7000-8000-000000000002";
const THIRD = "0192f3a4-0000-7000-8000-000000000003";
const FOURTH = "0192f3a4-0000-7000-8000-000000000004";

const slot = {
  date: "2027-01-05",
  startTime: "07:30",
  durationMinutes: 90,
  format: "written",
  paperDeadline: "2027-01-01T10:00:00.000Z",
  rooms: [{ roomId: OTHER, proctorIds: [THIRD, FOURTH] }],
} as const;

const update = { id: ID, ...slot };

const session = (overrides: Partial<Parameters<typeof examConflicts>[0]> = {}) => ({
  id: ID,
  classCode: "COMP1020.01",
  date: "2027-01-05",
  startTime: "07:30",
  durationMinutes: 90,
  roomIds: [OTHER],
  roomCodeOf: { [OTHER]: "A.201" },
  proctors: [{ id: THIRD, name: "ThS. A" }],
  ...overrides,
});

const permissionsOf = (id: string) => ROLES.find((role) => role.id === id)!.permissions;

describe("exams: kiểm dữ liệu và quy tắc", () => {
  test("sửa ca thi hợp lệ; không thi chủ nhật, giờ phải là ca thi của trường, hạn nộp đề trước giờ thi", () => {
    assert.ok(parseInput(EXAM_SESSION_UPDATE_SCHEMA, update).ok);
    const sunday = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, date: "2027-01-03", startTime: "06:30" });
    assert.ok(!sunday.ok);
    assert.deepEqual(Object.keys(sunday.fieldErrors ?? {}).toSorted(), ["date", "startTime"]);
    const late = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, paperDeadline: "2027-01-05T01:00:00.000Z" });
    assert.equal(!late.ok && late.fieldErrors?.paperDeadline, "Hạn nộp đề phải trước giờ thi");
    // 00:29 UTC = 07:29 giờ Việt Nam: vẫn trước giờ thi.
    assert.ok(parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, paperDeadline: "2027-01-05T00:29:00.000Z" }).ok);
  });

  test("mỗi phòng ít nhất 2 cán bộ coi thi, một cán bộ chỉ coi một phòng, một phòng chọn một lần", () => {
    const one = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, rooms: [{ roomId: OTHER, proctorIds: [THIRD] }] });
    assert.ok(!one.ok && /ít nhất 2 cán bộ/.test(one.fieldErrors?.["rooms.0.proctorIds"] ?? ""));
    const twice = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, rooms: [{ roomId: OTHER, proctorIds: [THIRD, FOURTH] }, { roomId: ID, proctorIds: [THIRD, OTHER] }] });
    assert.equal(!twice.ok && twice.fieldErrors?.rooms, "Một cán bộ chỉ coi một phòng trong ca");
    const sameRoom = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, rooms: [{ roomId: OTHER, proctorIds: [THIRD, FOURTH] }, { roomId: OTHER, proctorIds: [ID, ID.replace("1", "5")] }] });
    assert.ok(!sameRoom.ok);
    const makeup = parseInput(EXAM_SESSION_CREATE_SCHEMA, { ...slot, classSectionId: ID, kind: "makeup" });
    assert.ok(!makeup.ok);
    assert.deepEqual(Object.keys(makeup.fieldErrors ?? {}).toSorted(), ["makeupEnrollmentIds", "makeupOfId"]);
  });

  test("xung đột theo khoảng thời gian chồng nhau (không chỉ cùng giờ bắt đầu); chạm mép thì không trùng", () => {
    assert.ok(slotsOverlap({ date: "2027-01-05", startTime: "07:30", durationMinutes: 90 }, { date: "2027-01-05", startTime: "08:30", durationMinutes: 60 }));
    assert.ok(!slotsOverlap({ date: "2027-01-05", startTime: "07:30", durationMinutes: 120 }, { date: "2027-01-05", startTime: "09:30", durationMinutes: 60 }));
    assert.ok(!slotsOverlap({ date: "2027-01-05", startTime: "07:30", durationMinutes: 90 }, { date: "2027-01-06", startTime: "07:30", durationMinutes: 90 }));
    const other = session({ id: OTHER, classCode: "MATH1011.01", startTime: "08:30", durationMinutes: 60 });
    const conflicts = examConflicts(session(), [other], { [OTHER]: 3 });
    assert.deepEqual(
      conflicts.map((conflict) => [conflict.kind, conflict.isHard]),
      [
        ["room", true],
        ["proctor", true],
        ["student", false],
      ],
    );
    assert.equal(conflicts[0].message, "Trùng phòng A.201 với MATH1011.01");
    assert.match(conflicts[2].message, /3 sinh viên thi trùng giờ/);
    assert.deepEqual(examConflicts(session(), [session({ id: OTHER, startTime: "09:30" })]), []);
  });

  test("chia thí sinh vào phòng theo sức chứa thi, số báo danh liên tục; thiếu chỗ thì báo số người chưa có chỗ", () => {
    const people = Array.from({ length: 70 }, (_, index) => index);
    const plan = assignCandidates(people, [
      { id: "a", examCapacity: 40 },
      { id: "b", examCapacity: 34 },
    ]);
    assert.ok(plan.ok);
    const inA = plan.assigned.filter((seat) => seat.roomId === "a").length;
    assert.ok(inA <= 40 && 70 - inA <= 34);
    assert.deepEqual(
      plan.assigned.map((seat) => seat.candidateNumber),
      Array.from({ length: 70 }, (_, index) => index + 1),
    );
    const short = assignCandidates(people, [{ id: "a", examCapacity: 40 }]);
    assert.ok(!short.ok && short.shortfall === 30);
    const ordered = [
      { fullName: "Trần Văn Bình", code: "2" },
      { fullName: "Nguyễn Thị An", code: "1" },
      { fullName: "Lê An", code: "3" },
    ].toSorted(byVietnameseName);
    assert.deepEqual(
      ordered.map((entry) => entry.code),
      ["3", "1", "2"],
    );
  });

  test("cấm thi khi vắng VƯỢT ngưỡng trên tổng số tiết kế hoạch; đầu kỳ vắng vài tiết chưa bị cấm", () => {
    assert.ok(!isBannedFromExam(9, 45, 20), "đúng 20% chưa vượt ngưỡng");
    assert.ok(isBannedFromExam(10, 45, 20));
    assert.ok(!isBannedFromExam(3, 45, 20), "vắng 3/12 tiết đã học nhưng chỉ 3/45 tiết kế hoạch");
    assert.ok(!isBannedFromExam(5, 0, 20));
    assert.equal(periodsLeftBeforeBan(9, 45, 20), 1);
    assert.equal(periodsLeftBeforeBan(12, 45, 20), 0);
  });

  test("nộp đề: quá hạn thì chặn (trừ đề bị trả lại), tới giờ thi thì chặn hẳn; xét đề chỉ khi đang chờ duyệt", () => {
    const past = "2020-01-01T00:00:00.000Z";
    const future = "2099-01-01T00:00:00.000Z";
    assert.ok(canSubmitPaper({ status: "published", hasStarted: false, paperStatus: "not-submitted", paperDeadline: future }));
    assert.match(paperSubmitBlockedReason({ status: "published", hasStarted: false, paperStatus: "submitted", paperDeadline: past }) ?? "", /quá hạn/);
    assert.ok(canSubmitPaper({ status: "published", hasStarted: false, paperStatus: "returned", paperDeadline: past }));
    assert.match(paperSubmitBlockedReason({ status: "published", hasStarted: true, paperStatus: "returned", paperDeadline: future }) ?? "", /đã diễn ra/);
    assert.ok(!canSubmitPaper({ status: "published", hasStarted: false, paperStatus: "approved", paperDeadline: future }));
    assert.equal(paperReviewBlockedReason({ status: "published", hasStarted: false, paperStatus: "submitted" }), null);
    assert.match(paperReviewBlockedReason({ status: "published", hasStarted: true, paperStatus: "submitted" }) ?? "", /đã diễn ra/);
    assert.match(paperReviewBlockedReason({ status: "published", hasStarted: false, paperStatus: "returned" }) ?? "", /chờ giảng viên nộp lại/);
    const blank = parseInput(EXAM_PAPER_RETURN_SCHEMA, { examSessionId: ID, reason: "   " });
    assert.ok(!blank.ok && blank.fieldErrors?.reason === "Chưa nhập lý do trả lại");
  });

  test("cho dự thi và đổi ca phải có lý do, nộp đề chỉ nhận PDF", () => {
    assert.ok(!parseInput(ELIGIBILITY_OVERRIDE_SCHEMA, { enrollmentId: ID, reason: "   " }).ok);
    assert.ok(!parseInput(PROCTOR_SWAP_SCHEMA, { examSessionId: ID, colleagueId: OTHER, reason: "" }).ok);
    assert.ok(!parseInput(EXAM_PAPER_SUBMIT_SCHEMA, { examSessionId: "khong-phai-uuid" }).ok);
    const pdf = { name: "dap-an.PDF", size: 900, head: new TextEncoder().encode("%PDF-1.7\n") };
    const docx = { name: "de-thi.docx", size: 900, head: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) };
    const wrong = checkExamPaperFiles({ paper: docx, "answer-key": pdf });
    assert.ok(!wrong.ok);
    assert.deepEqual(Object.keys(wrong.fieldErrors), ["paper"]);
    const fake = checkExamPaperFiles({ paper: { ...pdf, name: "de.pdf", head: new TextEncoder().encode("<html>") }, "answer-key": pdf });
    assert.ok(!fake.ok && /không phải tệp PDF thật/.test(fake.fieldErrors.paper ?? ""));
  });

  test("vai trò mẫu: chỉ Phòng Khảo thí (và quản trị) duyệt đề; Giáo vụ khoa xem khảo sát", () => {
    assert.ok(permissionsOf("exam-office").includes("exams.review"));
    assert.ok(permissionsOf("system-admin").includes("exams.review"));
    assert.ok(!permissionsOf("academic-head").includes("exams.review") && permissionsOf("academic-head").includes("exams.manage"));
    assert.ok(!permissionsOf("academic-officer").includes("exams.review"));
    assert.ok(permissionsOf("faculty-secretary").includes("surveys.view"));
  });
});

class Rollback extends Error {}

// Chạy trong transaction rồi bỏ hết, không để lại dữ liệu cho test khác.
async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError) && !(error instanceof Rollback)) throw error;
    });
}

// Lỗi DB trong savepoint để transaction ngoài vẫn dùng tiếp được.
const savepointFailure = (tx: Transaction, run: (sp: Transaction) => Promise<unknown>) => failure(tx.transaction(async (sp) => void (await run(sp))));

// Lỗi nghiệp vụ trong savepoint: giữ transaction ngoài dùng tiếp được dù hàm đã ghi dở.
const rejectedIn = (tx: Transaction, run: (sp: Transaction) => Promise<unknown>) =>
  failure(tx.transaction(async (sp) => void (await run(sp)))).then((error) => (error instanceof ExamInputError ? error.message : `không phải ExamInputError: ${String(error)}`));

const upload = (name: string): PaperUpload => ({ key: newStorageKey("exams"), name, contentType: "application/pdf", data: new TextEncoder().encode("%PDF-1.7 đề") });

const viewerOf = (id: string, overrides: Partial<Viewer> = {}): Viewer => ({
  id,
  name: "Trần Minh Khoa",
  code: "PDT0001",
  roleId: "academic-head",
  roleKey: "academic-head",
  roleName: "Trưởng phòng Đào tạo",
  unit: "Phòng Đào tạo",
  faculty: null,
  permissions: [...ALL_PERMISSIONS],
  assignmentId: null,
  ...overrides,
});

const message = (error: unknown) => pgErrorMessage(error, EXAMS_CONSTRAINT_MESSAGE);

const adminId = async () => (await db.select({ id: user.id }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn")))[0].id;

const roomId = async (code: string) => (await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code)))[0].id;

// Giảng viên đang công tác, không coi ca thi và không có buổi dạy nào trong các ngày cho trước (để test không vướng lịch có sẵn).
async function freeLecturers(count: number, options: { facultyId?: string; dates?: string[] } = {}) {
  const dates = options.dates ?? ["2027-01-14", "2027-01-15", "2027-01-16"];
  const proctoring = db
    .select({ id: examProctors.lecturerId })
    .from(examProctors)
    .innerJoin(examSessions, and(eq(examSessions.id, examProctors.examSessionId), inArray(examSessions.date, dates)));
  const teaching = db
    .select({ id: sql<string>`${classSections.lecturerId}` })
    .from(classSessions)
    .innerJoin(classSections, eq(classSections.id, classSessions.classSectionId))
    .where(and(inArray(classSessions.date, dates), sql`${classSections.lecturerId} IS NOT NULL`));
  const rows = await db
    .select({ id: lecturers.id, facultyId: lecturers.facultyId })
    .from(lecturers)
    .where(and(eq(lecturers.status, "active"), notInArray(lecturers.id, proctoring), notInArray(lecturers.id, teaching), options.facultyId ? eq(lecturers.facultyId, options.facultyId) : undefined))
    .orderBy(asc(lecturers.code))
    .limit(count);
  assert.equal(rows.length, count, "seed không đủ giảng viên rảnh");
  return rows.map((row) => row.id);
}

const sectionByCode = async (code: string) =>
  (
    await db
      .select({ id: classSections.id, enrolled: classSections.enrolledCount, facultyId: courses.facultyId, lecturerId: classSections.lecturerId })
      .from(classSections)
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .where(eq(classSections.code, code))
  )[0];

const createInput = (values: Record<string, unknown>) => {
  const parsed = parseInput(EXAM_SESSION_CREATE_SCHEMA, values);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.data;
};

const sentTo = async (tx: Transaction, title: RegExp) => {
  const rows = await tx.select({ title: notifications.title, audience: notifications.audience }).from(notifications).orderBy(desc(notifications.createdAt));
  return rows.filter((row) => title.test(row.title));
};

const lecturerNotice = async (tx: Transaction, lecturerId: string) => {
  const [person] = await tx.select({ userId: lecturers.userId }).from(lecturers).where(eq(lecturers.id, lecturerId));
  if (!person.userId) return null;
  const [row] = await tx.select({ title: notifications.title }).from(notifications).where(eq(notifications.recipientUserId, person.userId)).orderBy(desc(notifications.createdAt)).limit(1);
  return row?.title ?? null;
};

describe("exams: ràng buộc ở DB", () => {
  test("đề đã nộp phải có đủ tệp, tệp không quá 20 MB, thời gian làm bài 15..240 phút, hạn nộp đề trước giờ thi", async () => {
    const [exam] = await db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.paperStatus, "not-submitted"), gt(examSessions.date, "2026-12-01")))
      .limit(1);
    await inRollback(async (tx) => {
      const set = (values: Partial<typeof examSessions.$inferInsert>) => savepointFailure(tx, (sp) => sp.update(examSessions).set(values).where(eq(examSessions.id, exam.id)));
      assert.equal(message(await set({ paperStatus: "submitted" })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_fields);
      assert.equal(message(await set({ durationMinutes: 300 })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_duration_range);
      assert.equal(message(await set({ paperDeadline: new Date(`${exam.date}T09:00:00+07:00`), startTime: "07:30" })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_deadline_before_exam);
      assert.equal(message(await set({ kind: "makeup" })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_makeup_of);
    });
  });

  test("đề nghị đổi ca: lúc gửi phải đang coi ca đó, không đổi cho chính mình, một đề nghị chờ mỗi ca", async () => {
    const [proctor] = await db.select().from(examProctors).limit(1);
    const assigned = db.select({ id: examProctors.lecturerId }).from(examProctors).where(eq(examProctors.examSessionId, proctor.examSessionId));
    const [outsider] = await db.select({ id: lecturers.id }).from(lecturers).where(notInArray(lecturers.id, assigned)).limit(1);
    await inRollback(async (tx) => {
      const notProctor = await savepointFailure(tx, (sp) =>
        sp.insert(examProctorSwapRequests).values({ examSessionId: proctor.examSessionId, requesterId: outsider.id, substituteId: proctor.lecturerId, reason: "Bận" }),
      );
      assert.equal(message(notProctor), EXAMS_CONSTRAINT_MESSAGE.exam_proctor_swap_requests_proctor_fk);
      const self = await savepointFailure(tx, (sp) =>
        sp.insert(examProctorSwapRequests).values({ examSessionId: proctor.examSessionId, requesterId: proctor.lecturerId, substituteId: proctor.lecturerId, reason: "Bận" }),
      );
      assert.equal(message(self), EXAMS_CONSTRAINT_MESSAGE.exam_proctor_swap_requests_distinct_people);
      const twice = await savepointFailure(tx, async (sp) => {
        const request = { examSessionId: proctor.examSessionId, requesterId: proctor.lecturerId, substituteId: outsider.id, reason: "Trùng lịch dạy" };
        await sp.delete(examProctorSwapRequests).where(eq(examProctorSwapRequests.examSessionId, proctor.examSessionId));
        await sp.insert(examProctorSwapRequests).values(request);
        await sp.insert(examProctorSwapRequests).values(request);
      });
      assert.equal(message(twice), EXAMS_CONSTRAINT_MESSAGE.exam_proctor_swap_requests_single_pending);
    });
  });

  test("mỗi đăng ký một quyết định cho dự thi còn hiệu lực; thu hồi xong thì cho lại được", async () => {
    const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments).where(eq(enrollments.status, "enrolled")).limit(1);
    await inRollback(async (tx) => {
      await tx.insert(examEligibilityOverrides).values({ enrollmentId: enrollment.id, reason: "Giấy nằm viện" });
      const twice = await savepointFailure(tx, (sp) => sp.insert(examEligibilityOverrides).values({ enrollmentId: enrollment.id, reason: "Giấy nằm viện" }));
      assert.equal(message(twice), EXAMS_CONSTRAINT_MESSAGE.exam_eligibility_overrides_enrollment_id_unique);
      const noReason = await savepointFailure(tx, (sp) => sp.update(examEligibilityOverrides).set({ revokedAt: new Date() }).where(eq(examEligibilityOverrides.enrollmentId, enrollment.id)));
      assert.equal(message(noReason), EXAMS_CONSTRAINT_MESSAGE.exam_eligibility_overrides_revoke_fields);
      await tx.update(examEligibilityOverrides).set({ revokedAt: new Date(), revokeReason: "Minh chứng giả" }).where(eq(examEligibilityOverrides.enrollmentId, enrollment.id));
      await tx.insert(examEligibilityOverrides).values({ enrollmentId: enrollment.id, reason: "Giấy xác nhận mới" });
    });
  });

  test("seed: không thi chủ nhật, mỗi phòng đủ 2 cán bộ coi thi, không vượt sức chứa; lớp tính điểm đồ án không có ca giữa kỳ", async () => {
    const midterms = EXAM_SESSIONS.filter((exam) => exam.kind === "midterm").map((exam) => exam.classCode);
    assert.ok(!midterms.includes("COMP1070.01") && !midterms.includes("COMP1031.01"));
    const overfull = await db.execute(sql`SELECT r.id FROM exam_session_rooms r JOIN rooms ro ON ro.id = r.room_id
      WHERE (SELECT count(*) FROM exam_candidates c WHERE c.exam_room_id = r.id) > ro.exam_capacity
        OR (SELECT count(*) FROM exam_proctors p WHERE p.exam_room_id = r.id) < 2`);
    assert.equal(overfull.length, 0);
  });
});

describe("exams: tạo, sửa, công bố ca thi", () => {
  test("tạo ca nhiều phòng: thiếu chỗ thì chặn; đủ chỗ thì xếp thí sinh và số báo danh; tạo ca thi bù cho danh sách sinh viên", async () => {
    const admin = await adminId();
    const viewer = viewerOf(admin);
    const section = await sectionByCode("COMP1070.01");
    const [a201, a203, h311] = await Promise.all([roomId("A.201"), roomId("A.203"), roomId("H.3.11")]);
    const people = await freeLecturers(4);
    const base = { classSectionId: section.id, kind: "midterm", date: "2027-01-16", startTime: "17:30", durationMinutes: 60, format: "written", paperDeadline: "2027-01-10T10:00:00.000Z" };
    await inRollback(async (tx) => {
      const tooSmall = await rejectedIn(tx, (sp) => createSession(sp, viewer, createInput({ ...base, rooms: [{ roomId: h311, proctorIds: people.slice(0, 2) }] })));
      assert.match(tooSmall, /chỉ đủ 24 chỗ ngồi thi cho \d+ thí sinh/);
      const id = await createSession(
        tx,
        viewer,
        createInput({
          ...base,
          rooms: [
            { roomId: a201, proctorIds: people.slice(0, 2) },
            { roomId: a203, proctorIds: people.slice(2, 4) },
          ],
        }),
      );
      const seats = await tx.select().from(examCandidates).where(eq(examCandidates.examSessionId, id)).orderBy(asc(examCandidates.candidateNumber));
      const [{ enrolled }] = await tx.select({ enrolled: sql<number>`count(*)::int` }).from(enrollments).where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.status, "enrolled")));
      assert.equal(seats.length, enrolled);
      assert.deepEqual(
        seats.map((seat) => seat.candidateNumber),
        Array.from({ length: enrolled }, (_, index) => index + 1),
      );
      assert.equal(new Set(seats.map((seat) => seat.examRoomId)).size, 2);
      const proctors = await tx.select().from(examProctors).where(eq(examProctors.examSessionId, id));
      assert.equal(proctors.length, 4);
      const twice = await rejectedIn(tx, (sp) => createSession(sp, viewer, createInput({ ...base, date: "2027-01-15", rooms: [{ roomId: a201, proctorIds: people.slice(0, 2) }, { roomId: a203, proctorIds: people.slice(2, 4) }] })));
      assert.match(twice, /không phải ExamInputError/, "trùng loại ca của lớp: DB chặn bằng unique index");

      // Ca thi bù: 2 sinh viên của lớp, hai ca bù cùng lớp vẫn được.
      const makeupStudents = seats.slice(0, 2).map((seat) => seat.enrollmentId);
      const makeupBase = { ...base, kind: "makeup", makeupOfId: id, makeupEnrollmentIds: makeupStudents, date: "2027-01-15", startTime: "17:30", paperDeadline: "2027-01-12T10:00:00.000Z" };
      const makeup = await createSession(tx, viewer, createInput({ ...makeupBase, rooms: [{ roomId: h311, proctorIds: people.slice(0, 2) }] }));
      const makeupSeats = await tx.select().from(examCandidates).where(eq(examCandidates.examSessionId, makeup));
      assert.deepEqual(makeupSeats.map((seat) => seat.enrollmentId).toSorted(), makeupStudents.toSorted());
      await createSession(tx, viewer, createInput({ ...makeupBase, date: "2027-01-14", startTime: "17:30", rooms: [{ roomId: h311, proctorIds: people.slice(2, 4) }] }));
    });
  });

  test("xung đột tính ở server trên toàn học kỳ: trùng phòng, trùng cán bộ (giờ chồng nhau) bị chặn; trùng lịch thi của sinh viên phải ghi lý do", async () => {
    const admin = await adminId();
    const viewer = viewerOf(admin, { faculty: "Khoa Công nghệ Thông tin" });
    const first = await sectionByCode("COMP1070.01");
    const people = await freeLecturers(6);
    const [a201, b302, h204] = await Promise.all([roomId("A.201"), roomId("B.302"), roomId("H.2.04")]);
    const base = { kind: "midterm", date: "2027-01-16", durationMinutes: 120, format: "written", paperDeadline: "2027-01-10T10:00:00.000Z" };
    await inRollback(async (tx) => {
      const id = await createSession(tx, viewer, createInput({ ...base, classSectionId: first.id, startTime: "13:30", rooms: [{ roomId: a201, proctorIds: people.slice(0, 2) }, { roomId: b302, proctorIds: people.slice(2, 4) }] }));
      // Lớp khác khoa (Toán): người xem phạm vi khoa CNTT không thấy, nhưng xung đột vẫn tính (Phòng Khảo thí toàn trường tạo).
      const math = await sectionByCode("MATH1011.01");
      const university = viewerOf(admin);
      // Bắt đầu 15:30, ca trước kết thúc 15:30: không trùng dù cùng phòng.
      await tx.transaction(async (sp) => {
        await createSession(sp, university, createInput({ ...base, kind: "makeup", makeupOfId: (await sp.select({ id: examSessions.id }).from(examSessions).where(and(eq(examSessions.classSectionId, math.id), eq(examSessions.kind, "final"))))[0].id, makeupEnrollmentIds: (await sp.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.classSectionId, math.id), eq(enrollments.status, "enrolled"))).limit(1)).map((row) => row.id), classSectionId: math.id, startTime: "15:30", rooms: [{ roomId: a201, proctorIds: people.slice(0, 2) }] }));
        sp.rollback();
      }).catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
      const mathFinal = (await tx.select({ id: examSessions.id }).from(examSessions).where(and(eq(examSessions.classSectionId, math.id), eq(examSessions.kind, "final"))))[0].id;
      const mathStudent = (await tx.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.classSectionId, math.id), eq(enrollments.status, "enrolled"))).limit(1)).map((row) => row.id);
      const overlap = { ...base, kind: "makeup", makeupOfId: mathFinal, makeupEnrollmentIds: mathStudent, classSectionId: math.id, startTime: "13:30", durationMinutes: 60 };
      assert.match(await rejectedIn(tx, (sp) => createSession(sp, university, createInput({ ...overlap, rooms: [{ roomId: a201, proctorIds: people.slice(4, 6) }] }))), /Trùng phòng A\.201 với COMP1070\.01/);
      assert.match(await rejectedIn(tx, (sp) => createSession(sp, university, createInput({ ...overlap, rooms: [{ roomId: h204, proctorIds: [people[0], people[4]] }] }))), /coi thi trùng giờ với COMP1070\.01/);

      // Sinh viên học cả hai lớp thi bù trùng giờ: cảnh báo mềm, cần lý do.
      const shared = await tx.select({ id: examCandidates.enrollmentId }).from(examCandidates).where(eq(examCandidates.examSessionId, id)).limit(1);
      const firstFinal = (await tx.select({ id: examSessions.id }).from(examSessions).where(and(eq(examSessions.classSectionId, first.id), eq(examSessions.kind, "final"))))[0].id;
      const clash = { ...base, kind: "makeup", makeupOfId: firstFinal, makeupEnrollmentIds: shared.map((row) => row.id), classSectionId: first.id, startTime: "13:30", durationMinutes: 60, rooms: [{ roomId: h204, proctorIds: people.slice(4, 6) }] };
      const soft = await rejectedIn(tx, (sp) => createSession(sp, university, createInput(clash)));
      assert.match(soft, /1 sinh viên thi trùng giờ với COMP1070\.01.*ghi lý do/);
      await createSession(tx, university, createInput({ ...clash, overrideReason: "Sinh viên thi bù cuối kỳ, đã thi giữa kỳ trước" }));
      const [log] = await tx.select({ summary: auditLogs.summary }).from(auditLogs).where(and(eq(auditLogs.entityType, "exam"), sql`${auditLogs.summary} LIKE '%Bỏ qua cảnh báo%'`));
      assert.match(log.summary, /Sinh viên thi bù cuối kỳ/);
    });
  });

  test("cán bộ coi thi trùng giờ dạy (buổi học có ngày): cảnh báo mềm, cần lý do", async () => {
    const admin = await adminId();
    const viewer = viewerOf(admin);
    const section = await sectionByCode("COMP1070.01");
    // Buổi học tháng 12 phủ tiết 2 (07:20-08:10) của một giảng viên không phải người dạy lớp đang xếp thi.
    const [lesson] = await db
      .select({ date: classSessions.date, lecturerId: classSections.lecturerId })
      .from(classSessions)
      .innerJoin(classSections, eq(classSections.id, classSessions.classSectionId))
      .where(and(gt(classSessions.date, "2026-11-10"), lte(classSessions.date, "2026-12-20"), lte(classSessions.startPeriod, 2), sql`${classSessions.endPeriod} >= 2`, sql`${classSections.lecturerId} IS NOT NULL`, sql`${classSections.lecturerId} <> ${section.lecturerId}`, sql`extract(dow from ${classSessions.date}) <> 0`))
      .limit(1);
    const helpers = (await freeLecturers(2, { dates: [lesson.date] })).filter((id) => id !== lesson.lecturerId);
    const a201 = await roomId("A.201");
    await inRollback(async (tx) => {
      const input = { classSectionId: section.id, kind: "midterm", date: lesson.date, startTime: "07:30", durationMinutes: 60, format: "written", paperDeadline: "2026-11-01T10:00:00.000Z", rooms: [{ roomId: a201, proctorIds: [lesson.lecturerId!, helpers[0]] }] };
      // Lớp 40 sinh viên vừa A.201 (40 chỗ).
      const error = await rejectedIn(tx, (sp) => createSession(sp, viewer, createInput(input)));
      assert.match(error, /có giờ dạy lớp .* trùng giờ thi/);
      await createSession(tx, viewer, createInput({ ...input, overrideReason: "Khoa đã bố trí dạy thay buổi này" }));
    });
  });

  test("công bố: chặn ca thiếu cán bộ; công bố thì báo sinh viên (có số báo danh), giảng viên, cán bộ coi thi, ghi nhật ký; sửa ca đã công bố thì báo thay đổi", async () => {
    const admin = await adminId();
    const viewer = viewerOf(admin);
    const section = await sectionByCode("COMP1070.01");
    const [a201, a203] = await Promise.all([roomId("A.201"), roomId("A.203")]);
    const people = await freeLecturers(4);
    const termId = (await db.select({ termId: classSections.termId }).from(classSections).where(eq(classSections.id, section.id)))[0].termId;
    await inRollback(async (tx) => {
      // Ca giữa kỳ hiện có ở trạng thái dự kiến đều đã công bố trong seed; chỉ ca mới tạo là dự kiến.
      const id = await createSession(
        tx,
        viewer,
        createInput({
          classSectionId: section.id,
          kind: "midterm",
          date: "2027-01-16",
          startTime: "15:30",
          durationMinutes: 60,
          format: "written",
          paperDeadline: "2027-01-10T10:00:00.000Z",
          rooms: [
            { roomId: a201, proctorIds: people.slice(0, 2) },
            { roomId: a203, proctorIds: people.slice(2, 4) },
          ],
        }),
      );
      await tx.delete(examProctors).where(and(eq(examProctors.examSessionId, id), eq(examProctors.lecturerId, people[3])));
      assert.match(await rejectedIn(tx, (sp) => publishDrafts(sp, viewer, termId, "midterm")), /COMP1070\.01: phòng thiếu cán bộ coi thi/);
      await replaceSessionRooms(tx, id, [
        { roomId: a201, proctorIds: people.slice(0, 2) },
        { roomId: a203, proctorIds: people.slice(2, 4) },
      ]);
      const result = await publishDrafts(tx, viewer, termId, "midterm");
      assert.deepEqual(result.ids, [id]);
      const [row] = await tx.select({ status: examSessions.status }).from(examSessions).where(eq(examSessions.id, id));
      assert.equal(row.status, "published");
      const published = await sentTo(tx, /Lịch thi giữa kỳ lớp COMP1070\.01 đã công bố/);
      assert.ok(published.some((entry) => entry.audience === "lecturer"));

      // Sinh viên có tài khoản cổng (sinh viên seed) trong ca thi bù: nhận thông báo khi công bố.
      const own = await sectionByCode("COMP1020.02");
      const [mine] = await tx.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.classSectionId, own.id), eq(enrollments.studentId, CURRENT_STUDENT_ID)));
      const [ownFinal] = await tx.select({ id: examSessions.id }).from(examSessions).where(and(eq(examSessions.classSectionId, own.id), eq(examSessions.kind, "final")));
      await createSession(
        tx,
        viewer,
        createInput({
          classSectionId: own.id,
          kind: "makeup",
          makeupOfId: ownFinal.id,
          makeupEnrollmentIds: [mine.id],
          date: "2027-01-14",
          startTime: "17:30",
          durationMinutes: 60,
          format: "written",
          paperDeadline: "2027-01-10T10:00:00.000Z",
          rooms: [{ roomId: await roomId("H.3.11"), proctorIds: people.slice(0, 2) }],
        }),
      );
      const makeups = await publishDrafts(tx, viewer, termId, "makeup");
      assert.ok(makeups.notifiedStudents >= 1);
      assert.ok((await sentTo(tx, /Lịch thi bù lớp COMP1020\.02 đã công bố/)).some((entry) => entry.audience === "student"));
      const [log] = await tx.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.entityType, "exam"), eq(auditLogs.entityId, termId), eq(auditLogs.action, "publish")));
      assert.ok(log);

      const parsed = parseInput(EXAM_SESSION_UPDATE_SCHEMA, {
        id,
        date: "2027-01-15",
        startTime: "15:30",
        durationMinutes: 60,
        format: "written",
        paperDeadline: "2027-01-10T10:00:00.000Z",
        rooms: [
          { roomId: a201, proctorIds: people.slice(0, 2) },
          { roomId: a203, proctorIds: people.slice(2, 4) },
        ],
      });
      assert.ok(parsed.ok);
      await updateSession(tx, viewer, parsed.data);
      const changed = await sentTo(tx, /Lịch thi giữa kỳ lớp COMP1070\.01 thay đổi/);
      assert.ok(changed.some((entry) => entry.audience === "lecturer"));
    });
  });

  test("tác vụ exam-sessions chuyển ca đã thi xong sang Đã thi; ca đã tới giờ thi không sửa được", async () => {
    const admin = await adminId();
    const [published] = await db
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(and(eq(examSessions.status, "published"), gt(examSessions.date, "2026-12-01")))
      .limit(1);
    await inRollback(async (tx) => {
      await tx.update(examSessions).set({ date: "2026-10-01", startTime: "07:30", paperDeadline: new Date("2026-09-25T10:00:00Z") }).where(eq(examSessions.id, published.id));
      const first = await refreshExamStatuses(tx);
      assert.ok(first.examSessionsDone >= 1);
      const [row] = await tx.select({ status: examSessions.status }).from(examSessions).where(eq(examSessions.id, published.id));
      assert.equal(row.status, "done");
      assert.equal((await refreshExamStatuses(tx)).examSessionsDone, 0, "chạy lại không đổi gì thêm");
      const parsed = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, id: published.id, rooms: [{ roomId: await roomId("A.201"), proctorIds: await freeLecturers(2, { dates: ["2027-01-05"] }) }] });
      assert.ok(parsed.ok);
      assert.match(await rejectedIn(tx, (sp) => updateSession(sp, viewerOf(admin), parsed.data)), /đã diễn ra/);
    });
  });
});

describe("exams: duyệt đề", () => {
  test("nộp, trả lại, nộp lại, duyệt đúng bản đã xem; quyền exams.review; mở khóa đề đã duyệt; DB khóa tệp; quá hạn và sau giờ thi không nộp được", async () => {
    const target = EXAM_SESSIONS.find((exam) => exam.kind === "final" && exam.classCode === "COMP1070.01")!;
    assert.equal(target.paperStatus, "not-submitted");
    const admin = await adminId();
    const [teacher] = await db.select({ id: lecturers.id, userId: lecturers.userId }).from(lecturers).where(eq(lecturers.id, target.lecturerId!));
    const [colleague] = await db
      .select({ id: lecturers.id })
      .from(lecturers)
      .where(notInArray(lecturers.id, [teacher.id]))
      .limit(1);
    const manager = viewerOf(admin);
    const lecturerNotices = (tx: Transaction) =>
      tx
        .select({ title: notifications.title, body: notifications.body, href: notifications.href })
        .from(notifications)
        .where(eq(notifications.recipientUserId, teacher.userId!))
        .orderBy(desc(notifications.createdAt), desc(notifications.id));
    const versionOf = async (tx: Transaction) => (await tx.select({ at: examSessions.paperSubmittedAt }).from(examSessions).where(eq(examSessions.id, target.id)))[0].at!.toISOString();

    await inRollback(async (tx) => {
      assert.match(await rejectedIn(tx, (sp) => recordPaperSubmission(sp, colleague.id, target.id, { paper: upload("a.pdf"), answerKey: upload("b.pdf") })), /không thuộc lớp bạn dạy/);
      const first = { paper: upload("Đề thi.pdf"), answerKey: upload("Đáp án.pdf") };
      const submitted = await recordPaperSubmission(tx, teacher.id, target.id, first);
      assert.equal(submitted.row.paperStatus, "submitted");
      const seen = await versionOf(tx);

      // Trưởng phòng Đào tạo (exams.manage, không có exams.review) không duyệt được.
      const head = viewerOf(admin, { permissions: ROLES.find((role) => role.id === "academic-head")!.permissions });
      assert.match(await rejectedIn(tx, (sp) => decidePaperReview(sp, head, target.id, { decision: "approve", paperSubmittedAt: seen })), /không có quyền duyệt/);
      const otherFaculty = viewerOf(admin, { faculty: "Khoa Ngữ văn", permissions: ["exams.manage", "exams.review"] });
      assert.match(await rejectedIn(tx, (sp) => decidePaperReview(sp, otherFaculty, target.id, { decision: "approve", paperSubmittedAt: seen })), /ngoài phạm vi khoa/);

      // Giảng viên thay đề trong lúc người duyệt đang xem bản cũ: duyệt bị từ chối.
      const second = await recordPaperSubmission(tx, teacher.id, target.id, { paper: upload("Đề thi v2.pdf"), answerKey: upload("Đáp án v2.pdf") });
      assert.deepEqual(second.replaced.toSorted(), [first.paper.key, first.answerKey.key].toSorted());
      assert.match(await rejectedIn(tx, (sp) => decidePaperReview(sp, manager, target.id, { decision: "approve", paperSubmittedAt: seen })), /bản đề mới/);

      const reason = "Đáp án câu 2 thiếu thang điểm.";
      assert.equal(await decidePaperReview(tx, manager, target.id, { decision: "return", reason }), "returned");
      assert.match((await lecturerNotices(tx))[0].body, /Đáp án câu 2 thiếu thang điểm\. Sửa đề/);
      await recordPaperSubmission(tx, teacher.id, target.id, { paper: upload("Đề thi v3.pdf"), answerKey: upload("Đáp án v3.pdf") });
      assert.equal(await decidePaperReview(tx, manager, target.id, { decision: "approve", paperSubmittedAt: await versionOf(tx) }), "approved");
      assert.match((await lecturerNotices(tx))[0].title, /đã được duyệt/);

      // Đã duyệt: không nộp lại; DB chặn đổi tệp và đổi về chờ duyệt; Phòng Khảo thí mở khóa được (thành bị trả lại, ghi nhật ký).
      assert.match(await rejectedIn(tx, (sp) => recordPaperSubmission(sp, teacher.id, target.id, { paper: upload("c.pdf"), answerKey: upload("d.pdf") })), /đã khóa/);
      const fileSwap = await savepointFailure(tx, (sp) => sp.update(examSessions).set({ paperFileName: "khac.pdf" }).where(eq(examSessions.id, target.id)));
      assert.equal(message(fileSwap), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_locked);
      const toSubmitted = await savepointFailure(tx, (sp) => sp.update(examSessions).set({ paperStatus: "submitted", paperReviewedAt: null, paperReviewedByUserId: null }).where(eq(examSessions.id, target.id)));
      assert.equal(message(toSubmitted), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_locked);
      assert.match(await rejectedIn(tx, (sp) => unlockApprovedPaper(sp, head, target.id, "Sai đề")), /không có quyền mở khóa/);
      await unlockApprovedPaper(tx, manager, target.id, "Câu 4 trùng đề năm trước");
      const [unlocked] = await tx.select().from(examSessions).where(eq(examSessions.id, target.id));
      assert.equal(unlocked.paperStatus, "returned");
      assert.equal(unlocked.paperReturnReason, "Câu 4 trùng đề năm trước");
      const audit = await tx.select({ summary: auditLogs.summary }).from(auditLogs).where(and(eq(auditLogs.entityType, "exam"), eq(auditLogs.entityId, target.id)));
      assert.ok(audit.some((entry) => /Mở khóa đề thi đã duyệt/.test(entry.summary)));

      // Quá hạn nộp: đề chưa nộp thì không nộp được nữa.
      await tx.update(examSessions).set({ paperStatus: "returned" }).where(eq(examSessions.id, target.id));
      const [fresh] = await tx
        .select({ id: examSessions.id, lecturerId: classSections.lecturerId })
        .from(examSessions)
        .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
        .where(and(eq(examSessions.paperStatus, "not-submitted"), gt(examSessions.date, "2026-12-01"), sql`${classSections.lecturerId} IS NOT NULL`))
        .limit(1);
      await tx.update(examSessions).set({ paperDeadline: new Date("2026-01-01T00:00:00Z") }).where(eq(examSessions.id, fresh.id));
      assert.match(await rejectedIn(tx, (sp) => recordPaperSubmission(sp, fresh.lecturerId!, fresh.id, { paper: upload("e.pdf"), answerKey: upload("f.pdf") })), /quá hạn nộp đề/);
      // Sau giờ thi: DB chặn cả khi ghi thẳng.
      await tx.update(examSessions).set({ date: "2026-02-01", paperDeadline: new Date("2026-01-01T00:00:00Z") }).where(eq(examSessions.id, target.id));
      const afterStart = await savepointFailure(tx, (sp) =>
        sp
          .update(examSessions)
          .set({ paperStatus: "submitted", paperReviewedAt: null, paperReviewedByUserId: null, paperReturnReason: null, paperSubmittedAt: new Date() })
          .where(eq(examSessions.id, target.id)),
      );
      assert.equal(message(afterStart), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_after_start);
    });
  });
});

describe("exams: đổi ca coi thi", () => {
  test("chấp nhận thì người thay vào đúng phòng của người gửi; từ chối thì giữ nguyên; người thay khác khoa bị chặn; lịch sử giữ khi người gửi bị gỡ", async () => {
    const admin = await adminId();
    const viewer = viewerOf(admin);
    const [proctor] = await db
      .select({ examSessionId: examProctors.examSessionId, date: examSessions.date, lecturerId: examProctors.lecturerId, examRoomId: examProctors.examRoomId, facultyId: lecturers.facultyId })
      .from(examProctors)
      .innerJoin(examSessions, and(eq(examSessions.id, examProctors.examSessionId), eq(examSessions.status, "published"), gt(examSessions.date, "2026-12-01")))
      .innerJoin(lecturers, eq(lecturers.id, examProctors.lecturerId))
      .where(sql`NOT EXISTS (SELECT 1 FROM exam_proctor_swap_requests s WHERE s.exam_session_id = ${examProctors.examSessionId})`)
      .limit(1);
    const [sameFaculty] = await freeLecturers(1, { facultyId: proctor.facultyId, dates: [proctor.date] });
    const [otherFaculty] = await db
      .select({ id: lecturers.id })
      .from(lecturers)
      .where(and(sql`${lecturers.facultyId} <> ${proctor.facultyId}`, eq(lecturers.status, "active")))
      .limit(1);
    await inRollback(async (tx) => {
      const [wrong] = await tx.insert(examProctorSwapRequests).values({ examSessionId: proctor.examSessionId, requesterId: proctor.lecturerId, substituteId: otherFaculty.id, reason: "Bận họp" }).returning();
      assert.match(await rejectedIn(tx, (sp) => decideProctorSwap(sp, viewer, wrong.id, "accepted", null)), /không cùng khoa/);
      await decideProctorSwap(tx, viewer, wrong.id, "rejected", "Chọn người cùng khoa");
      const [rejected] = await tx.select().from(examProctorSwapRequests).where(eq(examProctorSwapRequests.id, wrong.id));
      assert.equal(rejected.decision, "rejected");
      assert.ok(rejected.resolvedAt);
      assert.match((await lecturerNotice(tx, proctor.lecturerId)) ?? "không có tài khoản", /không được chấp nhận|không có tài khoản/);

      const [swap] = await tx.insert(examProctorSwapRequests).values({ examSessionId: proctor.examSessionId, requesterId: proctor.lecturerId, substituteId: sameFaculty, reason: "Trùng lịch dạy" }).returning();
      await decideProctorSwap(tx, viewer, swap.id, "accepted", null);
      const assigned = await tx.select().from(examProctors).where(eq(examProctors.examSessionId, proctor.examSessionId));
      assert.ok(!assigned.some((row) => row.lecturerId === proctor.lecturerId));
      assert.equal(assigned.find((row) => row.lecturerId === sameFaculty)?.examRoomId, proctor.examRoomId);
      assert.match(await rejectedIn(tx, (sp) => decideProctorSwap(sp, viewer, swap.id, "accepted", null)), /đã được xử lý/);
      // Người gửi đã rời ca nhưng hai đề nghị vẫn còn làm lịch sử.
      const history = await tx.select({ id: examProctorSwapRequests.id }).from(examProctorSwapRequests).where(inArray(examProctorSwapRequests.id, [wrong.id, swap.id]));
      assert.equal(history.length, 2);

      // Phòng Khảo thí đổi phân công gỡ người có đề nghị đang chờ: đề nghị hết hiệu lực, không bị xóa.
      const [stillThere] = assigned.filter((row) => row.lecturerId !== sameFaculty);
      const [pending] = await tx.insert(examProctorSwapRequests).values({ examSessionId: proctor.examSessionId, requesterId: stillThere.lecturerId, substituteId: proctor.lecturerId, reason: "Ốm" }).returning();
      const roomsNow = await tx.select({ roomId: sql<string>`r.room_id`, id: sql<string>`r.id` }).from(sql`exam_session_rooms r`).where(sql`r.exam_session_id = ${proctor.examSessionId}`);
      await replaceSessionRooms(
        tx,
        proctor.examSessionId,
        roomsNow.map((room) => ({ roomId: room.roomId, proctorIds: assigned.filter((row) => row.examRoomId === room.id).map((row) => (row.lecturerId === stillThere.lecturerId ? proctor.lecturerId : row.lecturerId)) })),
      );
      const [withdrawn] = await tx.select().from(examProctorSwapRequests).where(eq(examProctorSwapRequests.id, pending.id));
      assert.equal(withdrawn.decision, "withdrawn");
    });
  });
});
