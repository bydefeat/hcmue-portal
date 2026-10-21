import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { deleteFiles, readFile } from "@/shared/libs/storage.lib";
import { matchesSignature } from "@/shared/libs/upload.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { examSessions } from "@/modules/exams/exams.schema";
import { gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { auditLogs } from "@/modules/audit/audit.schema";
import { students } from "@/modules/users/users.schema";
import { officeStepRoles, REQUESTS_CONSTRAINT_MESSAGE } from "@/modules/requests/requests.constant";
import { allocateRequestCode, currentComponentScore, decideStep, insertRequest, RequestError, studentRequestFacts, withAttachments } from "@/modules/requests/requests.lib";
import {
  cancelBlockedReason,
  checkAttachments,
  DECIDE_STEP_SCHEMA,
  gradeChangeBlockedReason,
  readRequestForm,
  initialSteps,
  LECTURER_REQUEST_SCHEMA,
  planDecision,
  STUDENT_REQUEST_SCHEMA,
  studentRequestContent,
} from "@/modules/requests/requests.rule";
import { REQUESTS } from "@/modules/requests/requests.mock";
import { academicRequests, requestAttachments, requestCodeCounters, requestSteps } from "@/modules/requests/requests.schema";

const TEST_YEAR = 2099;
const FILE_TEST_YEAR = 2098;
const createdIds: string[] = [];
const createdKeys: string[] = [];
let studentId = "";
let studentUserId: string | null = null;
let facultyId = "";

before(async () => {
  [{ id: studentId, userId: studentUserId }] = await db.select({ id: students.id, userId: students.userId }).from(students).orderBy(asc(isNull(students.userId))).limit(1);
  [{ id: facultyId }] = await db.select({ id: faculties.id }).from(faculties).limit(1);
});

after(async () => {
  await deleteFiles(createdKeys);
  if (createdIds.length > 0) await db.delete(academicRequests).where(inArray(academicRequests.id, createdIds));
  await db.delete(requestCodeCounters).where(inArray(requestCodeCounters.year, [TEST_YEAR, FILE_TEST_YEAR]));
  for (const year of [TEST_YEAR, FILE_TEST_YEAR]) {
    await db.delete(notifications).where(like(notifications.title, `Đơn DT-${year}-%`));
    await db.delete(auditLogs).where(like(auditLogs.entityLabel, `DT-${year}-%`));
  }
  await db.$client.end();
});

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
const actor = { userId: null, name: "Người duyệt kiểm thử", role: "Kiểm thử" };

describe("requests: kiểm dữ liệu gửi đơn", () => {
  test("đơn sinh viên: lấy đúng các ô của loại đơn, cắt khoảng trắng lý do", () => {
    const parsed = parseInput(STUDENT_REQUEST_SCHEMA, { kind: "overload", credits: 28, extra: " COMP1120 ", reason: "  Học trước  ", attachments: [] });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.fields, { credits: 28, extra: "COMP1120" });
    assert.equal(parsed.data.reason, "Học trước");
  });

  test("đơn sinh viên: lỗi gắn đúng ô", () => {
    const parsed = parseInput(STUDENT_REQUEST_SCHEMA, { kind: "regrade", section: "lop-1", score: 4.3, reason: " " });
    assert.ok(!parsed.ok);
    assert.deepEqual(Object.keys(parsed.fieldErrors ?? {}).toSorted(), ["reason", "score", "section"]);
    assert.equal(parsed.fieldErrors?.score, "Bước nhập là 0,25");
  });

  test("minh chứng: đúng loại theo đuôi và chữ ký đầu tệp, không quá 10 MB mỗi tệp, 25 MB mỗi đơn, 5 tệp", () => {
    const pdf = { name: "giấy xác nhận.pdf", size: 2048, head: new TextEncoder().encode("%PDF-1.4") };
    const png = { name: "anh.PNG", size: 2048, head: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
    const ok = checkAttachments([pdf, png]);
    assert.ok(ok.ok);
    assert.deepEqual(ok.files, [
      { name: "giấy xác nhận.pdf", contentType: "application/pdf" },
      { name: "anh.PNG", contentType: "image/png" },
    ]);
    const html = checkAttachments([{ ...pdf, head: new TextEncoder().encode("<script>") }]);
    assert.ok(!html.ok && /không phải tệp PDF thật/.test(html.message));
    const exe = checkAttachments([{ ...pdf, name: "tep.exe" }]);
    assert.ok(!exe.ok && /chỉ nhận PDF, PNG, JPG, Word/.test(exe.message));
    const big = checkAttachments([{ ...pdf, size: 11 * 1024 * 1024 }]);
    assert.ok(!big.ok && /tối đa 10,0 MB/.test(big.message));
    const total = checkAttachments([1, 2, 3].map(() => ({ ...pdf, size: 9 * 1024 * 1024 })));
    assert.ok(!total.ok && /Tổng dung lượng/.test(total.message));
    assert.ok(!checkAttachments(Array.from({ length: 6 }, () => pdf)).ok);
    assert.ok(!checkAttachments([{ ...pdf, size: 0 }]).ok);
  });

  test("đọc form gửi đơn: JSON ở ô input, tệp ở các ô files", () => {
    const formData = new FormData();
    formData.set("input", JSON.stringify({ kind: "transcript" }));
    formData.append("files", new File(["%PDF-1.4"], "a.pdf"));
    formData.append("files", "không phải tệp");
    const form = readRequestForm(formData);
    assert.deepEqual(form.input, { kind: "transcript" });
    assert.equal(form.files.length, 1);
    const broken = new FormData();
    broken.set("input", "{không phải json");
    assert.equal(readRequestForm(broken).input, null);
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
      componentLabel: "Giả mạo",
      oldScore: 1,
      newScore: 6.5,
      reason: "Nhập nhầm",
    });
    assert.ok(grade.ok && !("oldScore" in grade.data) && !("componentLabel" in grade.data));
    assert.deepEqual(gradeChangeBlockedReason({ label: "Cuối kỳ" }, 6.5, 6.5), { field: "newScore", message: "Điểm mới trùng điểm hiện tại" });
    assert.equal(gradeChangeBlockedReason(null, null, 6.5)?.field, "componentKey");
    assert.equal(gradeChangeBlockedReason({ label: "Cuối kỳ" }, null, 6.5), null);
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
      { label: "Ngày thi (sinh viên khai)", value: "04/11/2026" },
    ]);
    const regrade = studentRequestContent({ kind: "regrade", fields: { section: "x", score: 4.5 } }, "COMP1070.01 Web", { finalExam: { label: "Cuối kỳ", score: 3.75 } });
    assert.deepEqual(regrade.details.slice(1), [
      { label: "Điểm thi hiện tại (sinh viên khai)", value: "4,5" },
      { label: "Điểm cuối kỳ trên hệ thống", value: "3,75" },
    ]);
    const unknown = studentRequestContent({ kind: "regrade", fields: { section: "x", score: 4.5 } }, "COMP1070.01 Web", { finalExam: null });
    assert.match(unknown.details.at(-1)?.value ?? "", /^Không xác định/);
    const postponeWithExams = studentRequestContent({ kind: "exam-postpone", fields: { section: "x", examDate: "2026-11-04" } }, "COMP1020.02", {
      examDates: [{ kind: "final", date: "2027-01-05" }],
    });
    assert.deepEqual(postponeWithExams.details.at(-1), { label: "Lịch thi trên hệ thống", value: "Cuối kỳ 05/01/2027" });
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

  test("bước của đơn vị xử lý theo quyền requests.step.* của vai trò, không theo khóa vai trò", () => {
    assert.deepEqual(officeStepRoles(["requests.process", "requests.step.faculty"]), ["faculty"]);
    assert.deepEqual(officeStepRoles(["requests.process", "requests.step.exam-office"]), ["exam-office"]);
    assert.deepEqual(officeStepRoles(["requests.process", "requests.step.faculty", "requests.step.academic-office", "requests.step.exam-office"]).toSorted(), [
      "academic-office",
      "exam-office",
      "faculty",
    ]);
    assert.deepEqual(officeStepRoles(["requests.process"]), []);
    assert.deepEqual(officeStepRoles(["requests.step.faculty"]), []);
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
    if (studentUserId) {
      const sent = await db
        .select({ title: notifications.title, audience: notifications.audience, href: notifications.href })
        .from(notifications)
        .where(and(eq(notifications.recipientUserId, studentUserId), like(notifications.title, `Đơn DT-${TEST_YEAR}-00012 %`)))
        .orderBy(asc(notifications.createdAt), asc(notifications.id));
      assert.equal(sent.length, 3);
      assert.ok(sent.every((row) => row.audience === "student" && row.href.startsWith("/application/requests?open=")));
      assert.ok(sent.some((row) => row.title.endsWith("đã được duyệt")));
    }
  });
});

const pdf = (text: string) => ({ name: `${text}.pdf`, contentType: "application/pdf", data: new TextEncoder().encode(`%PDF-1.4\n${text}`) });

describe("requests: lưu minh chứng", () => {
  test("minh chứng của dữ liệu mẫu có tệp PDF hợp lệ trong kho, đúng kích thước đã lưu", async () => {
    const [sample] = await db.select().from(requestAttachments).where(eq(requestAttachments.id, REQUESTS.find((request) => request.attachments.length > 0)!.attachments[0].id));
    const data = await readFile(sample.storageKey);
    assert.ok(data && matchesSignature("pdf", data));
    assert.equal(data.byteLength, sample.sizeBytes);
    const text = new TextDecoder().decode(data);
    assert.ok(text.endsWith("%%EOF\n"));
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    assert.ok(offsets.length > 0);
    offsets.forEach((offset, index) => assert.ok(text.startsWith(`${index + 1} 0 obj`, offset)));
  });

  const newRequest = {
    kind: "transcript" as const,
    requester: { type: "student" as const, studentId: "" },
    subject: "Kiểm thử minh chứng",
    details: [],
    reason: "Kiểm thử",
    lecturerAssigneeId: null,
  };

  test("ghi tệp vào kho và dòng request_attachments cùng khóa, đọc lại đúng nội dung", async () => {
    const files = [pdf("giấy-một"), pdf("giấy-hai")];
    const request = await withAttachments(files, async (attachments) => {
      createdKeys.push(...attachments.map((file) => file.storageKey));
      return db.transaction(async (tx) => {
        const created = await insertRequest(tx, { ...newRequest, requester: { type: "student", studentId }, facultyId, attachments }, FILE_TEST_YEAR);
        createdIds.push(created.id);
        return created;
      });
    });
    const rows = await db.select().from(requestAttachments).where(eq(requestAttachments.requestId, request.id));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.match(row.storageKey, /^requests\/[0-9a-f-]{36}$/);
      const original = files.find((file) => file.name === row.fileName)!;
      assert.deepEqual(await readFile(row.storageKey), original.data);
      assert.equal(row.sizeBytes, original.data.byteLength);
    }
  });

  test("giao dịch hỏng thì tệp vừa ghi bị xóa, không để tệp mồ côi", async () => {
    let keys: string[] = [];
    await assert.rejects(
      withAttachments([pdf("se-bi-xoa")], async (attachments) => {
        keys = attachments.map((file) => file.storageKey);
        createdKeys.push(...keys);
        assert.ok(await readFile(keys[0]));
        await db.transaction(async (tx) => {
          const created = await insertRequest(tx, { ...newRequest, requester: { type: "student", studentId }, facultyId, attachments }, FILE_TEST_YEAR);
          await tx.insert(requestAttachments).values({ requestId: created.id, fileName: "x", contentType: "x", sizeBytes: 999_999_999, storageKey: "requests/x" });
        });
      }),
      (error) => pgErrorMessage(error, REQUESTS_CONSTRAINT_MESSAGE) === REQUESTS_CONSTRAINT_MESSAGE.request_attachments_size_range,
    );
    assert.equal(await readFile(keys[0]), null);
  });
});

describe("requests: giá trị hệ thống để đối chiếu", () => {
  test("điểm cột cuối kỳ và lịch thi của lớp đọc từ DB", async () => {
    const [score] = await db
      .select({
        enrollmentId: gradeScores.enrollmentId,
        score: gradeScores.score,
        classSectionId: gradeSheets.classSectionId,
        key: gradeComponents.key,
        label: gradeComponents.label,
      })
      .from(gradeScores)
      .innerJoin(gradeComponents, eq(gradeComponents.id, gradeScores.gradeComponentId))
      .innerJoin(gradeSheets, eq(gradeSheets.id, gradeComponents.gradeSheetId))
      .limit(1);
    assert.ok(score, "dữ liệu mẫu có điểm thành phần");
    const where = { classSectionId: score.classSectionId, enrollmentId: score.enrollmentId };
    assert.deepEqual(await db.transaction((tx) => currentComponentScore(tx, { ...where, componentKey: score.key })), { component: { label: score.label }, score: score.score });
    assert.deepEqual(await db.transaction((tx) => currentComponentScore(tx, { ...where, componentKey: "khong-co" })), { component: null, score: null });
    const [exam] = await db.select({ classSectionId: examSessions.classSectionId }).from(examSessions).limit(1);
    const facts = await db.transaction((tx) => studentRequestFacts(tx, "exam-postpone", { ...where, classSectionId: exam.classSectionId }));
    assert.ok((facts.examDates?.length ?? 0) >= 1);
    assert.deepEqual(await db.transaction((tx) => studentRequestFacts(tx, "transcript", where)), {});
  });
});
