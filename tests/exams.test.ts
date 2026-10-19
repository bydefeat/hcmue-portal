import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { enrollments } from "@/modules/course-registration/course-registration.schema";
import { EXAMS_CONSTRAINT_MESSAGE, examConflicts } from "@/modules/exams/exams.constant";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import { ELIGIBILITY_OVERRIDE_SCHEMA, EXAM_PAPER_SUBMIT_SCHEMA, EXAM_SESSION_UPDATE_SCHEMA, PROCTOR_SWAP_SCHEMA } from "@/modules/exams/exams.rule";
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
    const paper = parseInput(EXAM_PAPER_SUBMIT_SCHEMA, { examSessionId: ID, paperFileName: "de-thi.docx", keyFileName: "dap-an.PDF" });
    assert.ok(!paper.ok);
    assert.deepEqual(Object.keys(paper.fieldErrors ?? {}), ["paperFileName"]);
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
  test("đề đã nộp phải có tệp, thời gian làm bài 15..240 phút", async () => {
    const [exam] = await db.select().from(examSessions).where(eq(examSessions.paperStatus, "not-submitted")).limit(1);
    const paper = await failure(db.update(examSessions).set({ paperStatus: "submitted" }).where(eq(examSessions.id, exam.id)));
    assert.equal(pgErrorMessage(paper, EXAMS_CONSTRAINT_MESSAGE), EXAMS_CONSTRAINT_MESSAGE.exam_sessions_paper_fields);
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
