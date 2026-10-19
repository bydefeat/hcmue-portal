import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { students } from "@/modules/users/users.schema";
import { officeStepRoles, REQUESTS_CONSTRAINT_MESSAGE } from "@/modules/requests/requests.constant";
import { allocateRequestCode, decideStep, RequestError } from "@/modules/requests/requests.lib";
import {
  cancelBlockedReason,
  DECIDE_STEP_SCHEMA,
  initialSteps,
  LECTURER_REQUEST_SCHEMA,
  planDecision,
  STUDENT_REQUEST_SCHEMA,
  studentRequestContent,
} from "@/modules/requests/requests.rule";
import { academicRequests, requestCodeCounters, requestSteps } from "@/modules/requests/requests.schema";

const TEST_YEAR = 2099;
const createdIds: string[] = [];
let studentId = "";
let facultyId = "";

before(async () => {
  [{ id: studentId }] = await db.select({ id: students.id }).from(students).limit(1);
  [{ id: facultyId }] = await db.select({ id: faculties.id }).from(faculties).limit(1);
});

after(async () => {
  if (createdIds.length > 0) await db.delete(academicRequests).where(inArray(academicRequests.id, createdIds));
  await db.delete(requestCodeCounters).where(eq(requestCodeCounters.year, TEST_YEAR));
  await db.$client.end();
});

// Đơn "Học vượt tín chỉ" (cố vấn → khoa → Phòng Đào tạo) mã năm 2099 để không đụng bộ đếm thật.
async function makeRequest(number: number) {
  const now = new Date();
  const [request] = await db
    .insert(academicRequests)
    .values({ code: `DT-${TEST_YEAR}-${String(number).padStart(5, "0")}`, kind: "overload", requesterStudentId: studentId, facultyId, subject: "Kiểm thử", reason: "Kiểm thử" })
    .returning();
  createdIds.push(request.id);
  await db.insert(requestSteps).values(initialSteps("overload", now, null).map((step) => ({ ...step, requestId: request.id })));
  return request.id;
}

async function statuses(requestId: string) {
  const rows = await db.select({ status: requestSteps.status }).from(requestSteps).where(eq(requestSteps.requestId, requestId)).orderBy(asc(requestSteps.position));
  return rows.map((row) => row.status);
}

const anyone = () => null;
const actor = { userId: null, name: "Người duyệt kiểm thử" };

describe("requests: kiểm dữ liệu gửi đơn", () => {
  test("đơn sinh viên: lấy đúng các ô của loại đơn, cắt khoảng trắng lý do", () => {
    const parsed = parseInput(STUDENT_REQUEST_SCHEMA, { kind: "overload", credits: 28, extra: " COMP1120 ", reason: "  Học trước  ", attachments: [] });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.fields, { credits: 28, extra: "COMP1120" });
    assert.equal(parsed.data.reason, "Học trước");
  });

  test("đơn sinh viên: lỗi gắn đúng ô, kể cả tệp quá 5 MB", () => {
    const parsed = parseInput(STUDENT_REQUEST_SCHEMA, {
      kind: "regrade",
      section: "lop-1",
      score: 4.3,
      reason: " ",
      attachments: [{ name: "bai-thi.pdf", size: 6 * 1024 * 1024, type: "application/pdf" }],
    });
    assert.ok(!parsed.ok);
    assert.deepEqual(Object.keys(parsed.fieldErrors ?? {}).toSorted(), ["attachments.0.size", "reason", "score", "section"]);
    assert.equal(parsed.fieldErrors?.score, "Bước nhập là 0,25");
  });

  test("đơn sinh viên: không nhận loại đơn của giảng viên", () => {
    const parsed = parseInput(STUDENT_REQUEST_SCHEMA, { kind: "grade-change", reason: "Sửa điểm" });
    assert.ok(!parsed.ok && parsed.fieldErrors?.kind);
  });

  test("đơn giảng viên: tiết dạy bù ngược, điểm mới trùng điểm cũ", () => {
    const leave = parseInput(LECTURER_REQUEST_SCHEMA, {
      kind: "teaching-leave",
      classId: "0192f3a4-0000-7000-8000-000000000000",
      sessionDate: "2026-10-26|1",
      makeupDay: 7,
      makeupStart: 4,
      makeupEnd: 2,
      makeupRoom: "B.405",
      reason: "Hội thảo",
    });
    assert.ok(!leave.ok && leave.fieldErrors?.makeupEnd === "Tiết kết thúc đứng trước tiết bắt đầu");
    const grade = parseInput(LECTURER_REQUEST_SCHEMA, {
      kind: "grade-change",
      classId: "0192f3a4-0000-7000-8000-000000000000",
      studentId: "0192f3a4-0000-7000-8000-000000000001",
      componentKey: "final",
      componentLabel: "Cuối kỳ",
      oldScore: 6.5,
      newScore: 6.5,
      reason: "Nhập nhầm",
    });
    assert.ok(!grade.ok && grade.fieldErrors?.newScore === "Điểm mới trùng điểm hiện tại");
  });

  test("không đồng ý thì phải ghi lý do", () => {
    const parsed = parseInput(DECIDE_STEP_SCHEMA, { step: 0, decision: "rejected", comment: "   " });
    assert.ok(!parsed.ok && parsed.fieldErrors?.comment);
    assert.ok(parseInput(DECIDE_STEP_SCHEMA, { step: 0, decision: "approved", comment: "" }).ok);
  });

  test("nội dung đơn ghép ở server: lớp học phần, ngày, số thập phân dấu phẩy", () => {
    const postpone = studentRequestContent({ kind: "exam-postpone", fields: { section: "x", examDate: "2026-11-04" } }, "COMP1020.02 Cấu trúc dữ liệu");
    assert.equal(postpone.subject, "COMP1020.02 Cấu trúc dữ liệu");
    assert.deepEqual(postpone.details, [
      { label: "Lớp học phần", value: "COMP1020.02 Cấu trúc dữ liệu" },
      { label: "Ngày thi", value: "04/11/2026" },
    ]);
    const regrade = studentRequestContent({ kind: "regrade", fields: { section: "x", score: 4.5 } }, "COMP1070.01 Web");
    assert.equal(regrade.details[1].value, "4,5");
    assert.equal(studentRequestContent({ kind: "transcript", fields: { copies: 2 } }, null).subject, "Cấp bảng điểm");
  });
});

describe("requests: quy tắc chuyển bước", () => {
  const now = new Date("2026-10-19T08:00:00Z");
  const base = { kind: "overload" as const, cancelled: false, now };

  test("đồng ý bước đang chờ thì bước sau đến lượt, hạn tính theo số ngày của bước sau", () => {
    const plan = planDecision({ ...base, statuses: ["approved", "pending", "waiting"], step: 1, decision: "approved" });
    assert.ok(plan.ok);
    assert.equal(plan.next?.index, 2);
    assert.equal(plan.next?.dueAt.toISOString(), "2026-10-22T08:00:00.000Z");
    const last = planDecision({ ...base, statuses: ["approved", "approved", "pending"], step: 2, decision: "approved" });
    assert.ok(last.ok && last.next === null);
  });

  test("chặn đơn đã hủy, đơn đã xong, bước không còn đang chờ", () => {
    const cancelled = planDecision({ ...base, cancelled: true, statuses: ["pending", "waiting", "waiting"], step: 0, decision: "approved" });
    assert.ok(!cancelled.ok && /hủy/.test(cancelled.message));
    const done = planDecision({ ...base, statuses: ["approved", "approved", "approved"], step: 2, decision: "approved" });
    assert.ok(!done.ok && done.message === "Đơn đã duyệt xong, không xử lý tiếp.");
    const rejected = planDecision({ ...base, statuses: ["approved", "rejected", "waiting"], step: 1, decision: "approved" });
    assert.ok(!rejected.ok && /từ chối/.test(rejected.message));
    const stale = planDecision({ ...base, statuses: ["approved", "pending", "waiting"], step: 0, decision: "approved" });
    assert.ok(!stale.ok && /người khác xử lý/.test(stale.message));
    const skipped = planDecision({ ...base, statuses: ["waiting", "pending", "waiting"], step: 1, decision: "approved" });
    assert.ok(!skipped.ok && /bước trước/.test(skipped.message));
  });

  test("chỉ hủy được đơn chưa bước nào xử lý", () => {
    assert.equal(cancelBlockedReason(false, ["pending", "waiting"]), null);
    assert.match(cancelBlockedReason(false, ["approved", "pending"]) ?? "", /đã được tiếp nhận/);
    assert.match(cancelBlockedReason(true, ["waiting", "waiting"]) ?? "", /đã hủy/);
  });

  test("vai trò quản trị xử lý bước nào", () => {
    assert.deepEqual(officeStepRoles("faculty-secretary"), ["faculty"]);
    assert.deepEqual(officeStepRoles("exam-office"), ["exam-office"]);
    assert.deepEqual(officeStepRoles("academic-head").toSorted(), ["academic-office", "exam-office", "faculty"]);
  });
});

describe("requests: ràng buộc ở DB", () => {
  test("mỗi đơn chỉ một bước đang chờ", async () => {
    const id = await makeRequest(1);
    const error = await db
      .update(requestSteps)
      .set({ status: "pending", dueAt: new Date() })
      .where(and(eq(requestSteps.requestId, id), eq(requestSteps.position, 2)))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, REQUESTS_CONSTRAINT_MESSAGE), REQUESTS_CONSTRAINT_MESSAGE.request_steps_one_pending);
  });

  test("không đồng ý phải có lý do, bước đã xử lý phải có tên người xử lý", async () => {
    const id = await makeRequest(2);
    const step = and(eq(requestSteps.requestId, id), eq(requestSteps.position, 1));
    const noComment = await db
      .update(requestSteps)
      .set({ status: "rejected", actedAt: new Date(), actorName: "A" })
      .where(step)
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(noComment, REQUESTS_CONSTRAINT_MESSAGE), REQUESTS_CONSTRAINT_MESSAGE.request_steps_reject_comment);
    const noActor = await db
      .update(requestSteps)
      .set({ status: "approved", actedAt: new Date() })
      .where(step)
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(noActor, REQUESTS_CONSTRAINT_MESSAGE), REQUESTS_CONSTRAINT_MESSAGE.request_steps_actor_name);
  });

  test("bước giảng viên phải gán giảng viên, mã đơn đúng định dạng", async () => {
    const id = await makeRequest(3);
    const lecturerStep = await db
      .insert(requestSteps)
      .values({ requestId: id, position: 9, role: "lecturer", label: "Giảng viên chấm lại" })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(lecturerStep, REQUESTS_CONSTRAINT_MESSAGE), REQUESTS_CONSTRAINT_MESSAGE.request_steps_lecturer_assignee);
    const badCode = await db
      .insert(academicRequests)
      .values({ code: "DT-2099-1", kind: "transcript", requesterStudentId: studentId, facultyId, subject: "x", reason: "x" })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(badCode, REQUESTS_CONSTRAINT_MESSAGE), REQUESTS_CONSTRAINT_MESSAGE.academic_requests_code_format);
  });
});

describe("requests: đồng thời", () => {
  test("nhiều người gửi đơn cùng lúc nhận mã tăng dần, không trùng", async () => {
    const codes = await Promise.all(Array.from({ length: 8 }, () => db.transaction((tx) => allocateRequestCode(tx, "student", TEST_YEAR))));
    assert.deepEqual(codes.toSorted(), Array.from({ length: 8 }, (_, index) => `DT-${TEST_YEAR}-${String(index + 1).padStart(5, "0")}`));
    const rolledBack = await db
      .transaction(async (tx) => {
        await allocateRequestCode(tx, "student", TEST_YEAR);
        throw new Error("hủy giao dịch");
      })
      .catch(() => null);
    assert.equal(rolledBack, null);
    assert.equal(await db.transaction((tx) => allocateRequestCode(tx, "student", TEST_YEAR)), `DT-${TEST_YEAR}-00009`);
  });

  test("hai người cùng duyệt một bước: chỉ một người được, bước sau đến lượt đúng một lần", async () => {
    const id = await makeRequest(11);
    const results = await Promise.allSettled(
      ["approved", "rejected"].map((decision) =>
        db.transaction((tx) => decideStep(tx, { requestId: id, step: 0, decision: decision as "approved" | "rejected", comment: "Ý kiến", actor, authorize: anyone })),
      ),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const failed = results.find((result) => result.status === "rejected");
    assert.ok(failed?.reason instanceof RequestError);
    const final = (await statuses(id)).join();
    assert.ok(final === "approved,pending,waiting" || final === "rejected,waiting,waiting");
  });

  test("đi đúng thứ tự, không duyệt bước của người khác, không duyệt đơn đã xong", async () => {
    const id = await makeRequest(12);
    const decide = (step: number, authorize: () => string | null = anyone) =>
      db.transaction((tx) => decideStep(tx, { requestId: id, step, decision: "approved", comment: "", actor, authorize }));
    await assert.rejects(decide(1), /người khác xử lý/);
    await assert.rejects(decide(0, () => "Bạn không phải cố vấn học tập của sinh viên gửi đơn."), /không phải cố vấn/);
    assert.deepEqual(await statuses(id), ["pending", "waiting", "waiting"]);
    await decide(0);
    await decide(1);
    await decide(2);
    assert.deepEqual(await statuses(id), ["approved", "approved", "approved"]);
    await assert.rejects(decide(2), /duyệt xong/);
  });
});
