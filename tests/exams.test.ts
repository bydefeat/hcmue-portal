import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, desc, eq, notInArray, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { newStorageKey } from "@/shared/libs/storage.lib";
import { enrollments } from "@/modules/course-registration/course-registration.schema";
import { EXAMS_CONSTRAINT_MESSAGE, examConflicts } from "@/modules/exams/exams.constant";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import {
  canSubmitPaper,
  checkExamPaperFiles,
  ELIGIBILITY_OVERRIDE_SCHEMA,
  EXAM_PAPER_RETURN_SCHEMA,
  EXAM_PAPER_SUBMIT_SCHEMA,
  EXAM_SESSION_UPDATE_SCHEMA,
  paperReviewBlockedReason,
  PROCTOR_SWAP_SCHEMA,
} from "@/modules/exams/exams.rule";
import { decidePaperReview, ExamInputError, recordPaperSubmission, type PaperUpload } from "@/modules/exams/exams.lib";
import { ALL_PERMISSIONS } from "@/modules/access/access.constant";
import type { Viewer } from "@/modules/access/access.type";
import { user } from "@/modules/authentication/authentication.schema";
import { auditLogs } from "@/modules/audit/audit.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { examEligibilityOverrides, examProctors, examProctorSwapRequests, examSessions } from "@/modules/exams/exams.schema";
import { lecturers } from "@/modules/users/users.schema";

after(() => db.$client.end());

const failure = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught);

const ID = "0192f3a4-0000-7000-8000-000000000001";
const OTHER = "0192f3a4-0000-7000-8000-000000000002";
const THIRD = "0192f3a4-0000-7000-8000-000000000003";

const update = { id: ID, date: "2027-01-05", startTime: "07:30", roomId: OTHER, format: "written", proctorIds: [OTHER, THIRD] } as const;

describe("exams: kiểm dữ liệu", () => {
  test("sửa ca thi hợp lệ", () => {
    assert.ok(parseInput(EXAM_SESSION_UPDATE_SCHEMA, update).ok);
  });

  test("không thi chủ nhật, giờ đúng dạng, đủ đúng 2 cán bộ khác nhau", () => {
    const sunday = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, date: "2027-01-03", startTime: "7h30" });
    assert.ok(!sunday.ok);
    assert.deepEqual(Object.keys(sunday.fieldErrors ?? {}).toSorted(), ["date", "startTime"]);
    const one = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, proctorIds: [OTHER] });
    assert.equal(!one.ok && one.fieldErrors?.proctorIds, "Mỗi phòng thi cần đúng 2 cán bộ coi thi");
    const same = parseInput(EXAM_SESSION_UPDATE_SCHEMA, { ...update, proctorIds: [OTHER, OTHER] });
    assert.equal(!same.ok && same.fieldErrors?.proctorIds, "Một cán bộ chỉ được chọn một lần");
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
    const missing = checkExamPaperFiles({ paper: pdf, "answer-key": null });
    assert.ok(!missing.ok && missing.fieldErrors["answer-key"] === "Chưa chọn tệp đáp án, thang điểm");
    // Đuôi .pdf nhưng nội dung là HTML: bị chặn theo chữ ký đầu tệp.
    const fake = checkExamPaperFiles({ paper: { ...pdf, name: "de.pdf", head: new TextEncoder().encode("<html>") }, "answer-key": pdf });
    assert.ok(!fake.ok && /không phải tệp PDF thật/.test(fake.fieldErrors.paper ?? ""));
    const big = checkExamPaperFiles({ paper: { ...pdf, size: 21 * 1024 * 1024 }, "answer-key": pdf });
    assert.ok(!big.ok && /tối đa 20,0 MB/.test(big.fieldErrors.paper ?? ""));
    const ok = checkExamPaperFiles({ paper: { ...pdf, name: "Đề thi.pdf" }, "answer-key": pdf });
    assert.ok(ok.ok && ok.files.paper.name === "Đề thi.pdf" && ok.files["answer-key"].contentType === "application/pdf");
  });

  test("xung đột phòng và cán bộ coi thi cùng ca", () => {
    const [first, second] = EXAM_SESSIONS;
    const clash = examConflicts([
      { ...first, date: "2027-01-05", startTime: "07:30", room: "A.201" },
      { ...second, date: "2027-01-05", startTime: "07:30", room: "A.201", proctors: first.proctors },
    ]);
    assert.equal(clash.filter((conflict) => conflict.examId === first.id).length, 2);
  });
});

describe("exams: ràng buộc ở DB", () => {
  test("đề đã nộp phải có đủ tệp đề và đáp án, tệp không quá 20 MB, thời gian làm bài 15..240 phút", async () => {
    const [exam] = await db.select().from(examSessions).where(eq(examSessions.paperStatus, "not-submitted")).limit(1);
    const paper = await failure(db.update(examSessions).set({ paperStatus: "submitted" }).where(eq(examSessions.id, exam.id)));
    assert.equal(pgErrorMessage(paper, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_fields);
    const files = {
      paperStatus: "submitted" as const,
      paperStorageKey: `exams/${OTHER}`,
      paperFileName: "de.pdf",
      paperContentType: "application/pdf",
      paperSizeBytes: 100,
      answerKeyStorageKey: `exams/${THIRD}`,
      answerKeyFileName: "dap-an.pdf",
      answerKeyContentType: "application/pdf",
      paperSubmittedAt: new Date(),
    };
    const noKey = await failure(db.update(examSessions).set({ ...files, answerKeySizeBytes: null }).where(eq(examSessions.id, exam.id)));
    assert.equal(pgErrorMessage(noKey, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_fields);
    const tooBig = await failure(db.update(examSessions).set({ ...files, answerKeySizeBytes: 21 * 1024 * 1024 }).where(eq(examSessions.id, exam.id)));
    assert.equal(pgErrorMessage(tooBig, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_size_range);
    const duration = await failure(db.update(examSessions).set({ durationMinutes: 300 }).where(eq(examSessions.id, exam.id)));
    assert.equal(pgErrorMessage(duration, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_duration_range);
  });

  test("chỉ người đang coi ca mới đề nghị đổi ca, không đổi cho chính mình, một đề nghị chờ mỗi ca", async () => {
    const [proctor] = await db.select().from(examProctors).limit(1);
    const assigned = db.select({ id: examProctors.lecturerId }).from(examProctors).where(eq(examProctors.examSessionId, proctor.examSessionId));
    const [outsider] = await db.select({ id: lecturers.id }).from(lecturers).where(notInArray(lecturers.id, assigned)).limit(1);

    const notProctor = await failure(
      db.insert(examProctorSwapRequests).values({ examSessionId: proctor.examSessionId, requesterId: outsider.id, substituteId: proctor.lecturerId, reason: "Bận" }),
    );
    assert.equal(pgErrorMessage(notProctor, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_proctor_swap_requests_proctor_fk);

    const self = await failure(
      db.insert(examProctorSwapRequests).values({ examSessionId: proctor.examSessionId, requesterId: proctor.lecturerId, substituteId: proctor.lecturerId, reason: "Bận" }),
    );
    assert.equal(pgErrorMessage(self, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_proctor_swap_requests_distinct_people);

    const twice = await failure(
      db.transaction(async (tx) => {
        const request = { examSessionId: proctor.examSessionId, requesterId: proctor.lecturerId, substituteId: outsider.id, reason: "Trùng lịch dạy" };
        await tx.insert(examProctorSwapRequests).values(request);
        await tx.insert(examProctorSwapRequests).values(request);
      }),
    );
    assert.equal(pgErrorMessage(twice, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_proctor_swap_requests_single_pending);
  });

  test("mỗi đăng ký chỉ có một quyết định cho dự thi", async () => {
    const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.status, "enrolled"))).limit(1);
    const error = await failure(
      db.transaction(async (tx) => {
        await tx.insert(examEligibilityOverrides).values({ enrollmentId: enrollment.id, reason: "Giấy nằm viện" });
        await tx.insert(examEligibilityOverrides).values({ enrollmentId: enrollment.id, reason: "Giấy nằm viện" });
      }),
    );
    assert.equal(pgErrorMessage(error, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_eligibility_overrides_enrollment_id_unique);
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

const rejected = (promise: Promise<unknown>) => failure(promise).then((error) => (error instanceof ExamInputError ? error.message : `không phải ExamInputError: ${String(error)}`));

describe("exams: duyệt, trả lại đề thi", () => {
  test("quy tắc: chỉ xét đề đang chờ duyệt của ca chưa thi; nộp lại được khi chưa duyệt; trả lại phải có lý do", () => {
    assert.equal(paperReviewBlockedReason({ status: "published", paperStatus: "submitted" }), null);
    assert.match(paperReviewBlockedReason({ status: "published", paperStatus: "not-submitted" }) ?? "", /chưa nộp/);
    assert.match(paperReviewBlockedReason({ status: "published", paperStatus: "approved" }) ?? "", /đã được duyệt/);
    assert.match(paperReviewBlockedReason({ status: "published", paperStatus: "returned" }) ?? "", /chờ giảng viên nộp lại/);
    assert.match(paperReviewBlockedReason({ status: "done", paperStatus: "submitted" }) ?? "", /đã diễn ra/);
    assert.ok(canSubmitPaper({ status: "published", paperStatus: "returned" }));
    assert.ok(canSubmitPaper({ status: "draft", paperStatus: "submitted" }));
    assert.ok(!canSubmitPaper({ status: "published", paperStatus: "approved" }));
    assert.ok(!canSubmitPaper({ status: "done", paperStatus: "not-submitted" }));
    const blank = parseInput(EXAM_PAPER_RETURN_SCHEMA, { examSessionId: ID, reason: "   " });
    assert.ok(!blank.ok && blank.fieldErrors?.reason === "Chưa nhập lý do trả lại");
    assert.ok(!parseInput(EXAM_PAPER_RETURN_SCHEMA, { examSessionId: ID, reason: "x".repeat(501) }).ok);
  });

  test("seed: có đề đã duyệt kèm người duyệt, một đề bị trả lại có lý do", async () => {
    const rows = await db
      .select({ status: examSessions.paperStatus, reviewedAt: examSessions.paperReviewedAt, reviewer: examSessions.paperReviewedByUserId, reason: examSessions.paperReturnReason })
      .from(examSessions);
    const approved = rows.filter((row) => row.status === "approved");
    assert.ok(approved.length >= 3 && approved.every((row) => row.reviewedAt && row.reviewer));
    const returned = rows.filter((row) => row.status === "returned");
    assert.equal(returned.length, 1);
    assert.ok(returned[0].reason && returned[0].reviewedAt);
  });

  test("nộp, trả lại có lý do, nộp lại, duyệt; đề đã duyệt bị khóa ở server và DB; giảng viên nhận thông báo; ghi nhật ký", async () => {
    const target = EXAM_SESSIONS.find((exam) => exam.kind === "final" && exam.classCode === "COMP1070.01")!;
    assert.equal(target.paperStatus, "not-submitted");
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn"));
    const [teacher] = await db.select({ id: lecturers.id, userId: lecturers.userId }).from(lecturers).where(eq(lecturers.id, target.lecturerId!));
    const [colleague] = await db
      .select({ id: lecturers.id })
      .from(lecturers)
      .where(notInArray(lecturers.id, [teacher.id]))
      .limit(1);
    const manager = viewerOf(admin.id);
    const lecturerNotices = (tx: Transaction) =>
      tx
        .select({ title: notifications.title, body: notifications.body, href: notifications.href, kind: notifications.kind })
        .from(notifications)
        .where(eq(notifications.recipientUserId, teacher.userId!))
        .orderBy(desc(notifications.createdAt), desc(notifications.id));

    await inRollback(async (tx) => {
      assert.match(await rejected(decidePaperReview(tx, manager, target.id, { decision: "approve" })), /chưa nộp đề/);
      assert.match(await rejected(recordPaperSubmission(tx, colleague.id, target.id, { paper: upload("a.pdf"), answerKey: upload("b.pdf") })), /không thuộc lớp bạn dạy/);

      const first = { paper: upload("Đề thi.pdf"), answerKey: upload("Đáp án.pdf") };
      const submitted = await recordPaperSubmission(tx, teacher.id, target.id, first);
      assert.equal(submitted.row.paperStatus, "submitted");
      assert.deepEqual(submitted.replaced, []);

      // Cán bộ khoa khác hoặc vai trò không có quyền quản lý thi không xét được.
      const otherFaculty = viewerOf(admin.id, { faculty: "Khoa Ngữ văn", permissions: ["exams.manage"] });
      assert.match(await rejected(decidePaperReview(tx, otherFaculty, target.id, { decision: "approve" })), /ngoài phạm vi khoa/);
      assert.match(await rejected(decidePaperReview(tx, viewerOf(admin.id, { permissions: ["grades.approve"] }), target.id, { decision: "approve" })), /không có quyền/);
      const scoped = viewerOf(admin.id, { faculty: target.faculty, permissions: ["exams.manage"], roleName: "Phòng Khảo thí" });

      const reason = "Đáp án câu 2 thiếu thang điểm.";
      assert.equal(await decidePaperReview(tx, scoped, target.id, { decision: "return", reason }), "returned");
      const [afterReturn] = await tx.select().from(examSessions).where(eq(examSessions.id, target.id));
      assert.equal(afterReturn.paperStatus, "returned");
      assert.equal(afterReturn.paperReturnReason, reason);
      assert.equal(afterReturn.paperReviewedByUserId, admin.id);
      assert.ok(afterReturn.paperReviewedAt);
      assert.equal(afterReturn.paperStorageKey, first.paper.key, "đề bị trả lại vẫn giữ tệp để giảng viên xem lại");
      const [returnNotice] = await lecturerNotices(tx);
      assert.equal(returnNotice.kind, "exam");
      assert.equal(returnNotice.href, "/lecturer/exams");
      assert.match(returnNotice.title, /bị trả lại/);
      assert.match(returnNotice.body, /Đáp án câu 2 thiếu thang điểm\. Sửa đề/);
      assert.match(await rejected(decidePaperReview(tx, scoped, target.id, { decision: "approve" })), /chờ giảng viên nộp lại/);

      const second = { paper: upload("Đề thi (sửa).pdf"), answerKey: upload("Đáp án (sửa).pdf") };
      const resubmitted = await recordPaperSubmission(tx, teacher.id, target.id, second);
      assert.equal(resubmitted.row.paperStatus, "submitted");
      assert.deepEqual(resubmitted.replaced.toSorted(), [first.paper.key, first.answerKey.key].toSorted());
      const [afterResubmit] = await tx.select().from(examSessions).where(eq(examSessions.id, target.id));
      assert.equal(afterResubmit.paperReturnReason, null);
      assert.equal(afterResubmit.paperReviewedAt, null);
      assert.equal(afterResubmit.paperReviewedByUserId, null);

      assert.equal(await decidePaperReview(tx, manager, target.id, { decision: "approve" }), "approved");
      const [approveNotice] = await lecturerNotices(tx);
      assert.match(approveNotice.title, /đã được duyệt/);
      const audit = await tx
        .select({ action: auditLogs.action, summary: auditLogs.summary })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, "exam"), eq(auditLogs.entityId, target.id)));
      assert.deepEqual(audit.map((entry) => entry.action).toSorted(), ["approve", "reject"]);
      assert.ok(audit.some((entry) => entry.summary.includes(reason)));

      // Đã duyệt: server không cho nộp lại, DB chặn mọi thay đổi tệp hay trạng thái đề; sửa giờ thi vẫn được.
      assert.match(await rejected(recordPaperSubmission(tx, teacher.id, target.id, { paper: upload("c.pdf"), answerKey: upload("d.pdf") })), /đề đã được duyệt/);
      const fileSwap = await savepointFailure(tx, (sp) => sp.update(examSessions).set({ paperFileName: "khac.pdf" }).where(eq(examSessions.id, target.id)));
      assert.equal(pgErrorMessage(fileSwap, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_locked);
      const reopen = await savepointFailure(tx, (sp) =>
        sp.update(examSessions).set({ paperStatus: "returned", paperReturnReason: "x", paperReviewedAt: new Date() }).where(eq(examSessions.id, target.id)),
      );
      assert.equal(pgErrorMessage(reopen, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_locked);
      await tx.update(examSessions).set({ startTime: "09:30" }).where(eq(examSessions.id, target.id));
    });
  });

  test("DB: đề bị trả lại phải có lý do và thời điểm xét; đề chưa xét không có lý do, người duyệt", async () => {
    const [exam] = await db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.paperStatus, "submitted"), eq(examSessions.status, "published")))
      .limit(1);
    const set = (tx: Transaction, values: Partial<typeof examSessions.$inferInsert>) => savepointFailure(tx, (sp) => sp.update(examSessions).set(values).where(eq(examSessions.id, exam.id)));
    await inRollback(async (tx) => {
      assert.equal(message(await set(tx, { paperStatus: "returned", paperReviewedAt: new Date() })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_return_reason);
      assert.equal(message(await set(tx, { paperStatus: "returned", paperReviewedAt: new Date(), paperReturnReason: "  " })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_return_reason);
      assert.equal(message(await set(tx, { paperStatus: "returned", paperReturnReason: "Thiếu đáp án" })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_review_fields);
      assert.equal(message(await set(tx, { paperReturnReason: "Thiếu đáp án" })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_return_reason);
      assert.equal(message(await set(tx, { paperReviewedAt: new Date() })), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_review_fields);
    });
  });
});
