import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { mockId } from "@/shared/libs/mock.lib";
import {
  addAdvisingNote,
  AdvisingError,
  createAppointmentFor,
  recordAppointmentOutcome,
  rescheduleAppointment,
  studentAdvisor,
  studentAppointments,
} from "@/modules/advising/advising.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { ADVISING_CONSTRAINT_MESSAGE } from "@/modules/advising/advising.constant";
import { ADVISING_NOTE_SCHEMA, APPOINTMENT_OUTCOME_SCHEMA, APPOINTMENT_RESCHEDULE_SCHEMA, APPOINTMENT_SCHEMA, appointmentsOverlap, outcomeStatus, splitAppointments } from "@/modules/advising/advising.rule";
import { advisingAppointments, advisingNotes, appointmentStudents } from "@/modules/advising/advising.schema";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID } from "@/modules/users/users.mock";

after(() => db.$client.end());

const STUDENT_ID = "01940000-0000-7000-8000-000000000000";

const appointment = {
  studentIds: [STUDENT_ID, STUDENT_ID],
  topic: "  Tư vấn kế hoạch học tập  ",
  date: dayjs().add(1, "day").format("YYYY-MM-DD"),
  startTime: "14:00",
  durationMinutes: 30,
  mode: "in-person",
  location: "Phòng B.201",
} as const;

describe("advising: kiểm dữ liệu lịch hẹn", () => {
  test("bỏ sinh viên trùng, cắt khoảng trắng nội dung", () => {
    const parsed = parseInput(APPOINTMENT_SCHEMA, appointment);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.studentIds, [STUDENT_ID]);
    assert.equal(parsed.data.topic, "Tư vấn kế hoạch học tập");
  });

  test("ngày đã qua, chưa chọn sinh viên, giờ sai định dạng báo theo ô", () => {
    const parsed = parseInput(APPOINTMENT_SCHEMA, { ...appointment, studentIds: [], date: "2020-01-01", startTime: "25:00", durationMinutes: 300 });
    assert.ok(!parsed.ok);
    const errors = (!parsed.ok && parsed.fieldErrors) || {};
    assert.equal(errors.studentIds, "Chọn ít nhất một sinh viên");
    assert.equal(errors.date, "Không hẹn vào ngày đã qua");
    assert.equal(errors.startTime, "Chọn giờ");
    assert.equal(errors.durationMinutes, "Tối đa 240 phút");
  });

  test("ghi nhận buổi gặp theo từng sinh viên: có người có mặt thì phải có nội dung; tất cả vắng thì không cần", () => {
    const parsed = parseInput(APPOINTMENT_OUTCOME_SCHEMA, { id: STUDENT_ID, attendance: { [STUDENT_ID]: "present" }, note: " Đã trao đổi ", followUp: "  " });
    assert.ok(parsed.ok && parsed.data.followUp === null && parsed.data.note === "Đã trao đổi");
    const empty = parseInput(APPOINTMENT_OUTCOME_SCHEMA, { id: STUDENT_ID, attendance: { [STUDENT_ID]: "present" }, note: " " });
    assert.equal(!empty.ok && empty.fieldErrors?.note, "Ghi lại nội dung chính đã trao đổi");
    assert.ok(parseInput(APPOINTMENT_OUTCOME_SCHEMA, { id: STUDENT_ID, attendance: { [STUDENT_ID]: "absent" } }).ok);
    assert.equal(outcomeStatus({ a: "absent", b: "present" }), "done");
    assert.equal(outcomeStatus({ a: "absent" }), "missed");
    assert.ok(!parseInput(ADVISING_NOTE_SCHEMA, { studentId: STUDENT_ID, topic: " ", content: "x" }).ok);
  });

  test("hai buổi hẹn chồng giờ", () => {
    const base = { date: "2026-10-20", startTime: "14:00", durationMinutes: 30 };
    assert.equal(appointmentsOverlap(base, { ...base, startTime: "14:15" }), true);
    assert.equal(appointmentsOverlap(base, { ...base, startTime: "14:30" }), false);
    assert.equal(appointmentsOverlap(base, { ...base, startTime: "13:30", durationMinutes: 45 }), true);
    assert.equal(appointmentsOverlap(base, { ...base, date: "2026-10-21" }), false);
  });
});

describe("advising: ràng buộc ở DB", () => {
  test("đã gặp phải có nội dung trao đổi, thời lượng trong khoảng", async () => {
    const [row] = await db.select().from(advisingAppointments).where(eq(advisingAppointments.status, "scheduled")).limit(1);
    const done = await db
      .update(advisingAppointments)
      .set({ status: "done", note: null })
      .where(eq(advisingAppointments.id, row.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(done, ADVISING_CONSTRAINT_MESSAGE), ADVISING_CONSTRAINT_MESSAGE.advising_appointments_done_note);
    const duration = await db
      .update(advisingAppointments)
      .set({ durationMinutes: 300 })
      .where(eq(advisingAppointments.id, row.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(duration, ADVISING_CONSTRAINT_MESSAGE), ADVISING_CONSTRAINT_MESSAGE.advising_appointments_duration_range);
  });

  test("một sinh viên chỉ được mời một lần vào cùng buổi hẹn", async () => {
    const [member] = await db.select().from(appointmentStudents).limit(1);
    const error = await db
      .insert(appointmentStudents)
      .values(member)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, ADVISING_CONSTRAINT_MESSAGE), ADVISING_CONSTRAINT_MESSAGE.appointment_students_appointment_id_student_id_pk);
  });
});

describe("advising: lịch hẹn của sinh viên", () => {
  test("chỉ buổi mình được mời, không có ghi chú của cố vấn, chỉ số người của buổi chung", async () => {
    const mine = await studentAppointments(CURRENT_STUDENT_ID);
    const ids = mine.map((item) => item.id);
    assert.ok(ids.includes(mockId("appointment:lh-03")));
    assert.ok(ids.includes(mockId("appointment:lh-09")));
    assert.ok(!ids.includes(mockId("appointment:lh-01")), "buổi hẹn của sinh viên khác không hiện");
    const group = mine.find((item) => item.id === mockId("appointment:lh-03"));
    assert.equal(group?.inviteeCount, 3);
    assert.equal(group?.startTime, "17:30");
    assert.ok(mine.every((item) => !("note" in item) && !("students" in item)));
    assert.equal(mine[0].advisor, "ThS. Phạm Thùy Hạnh");
  });

  test("sinh viên khác không thấy buổi hẹn của mình; id sai trả rỗng", async () => {
    const other = await studentAppointments(mockId("student:6"));
    assert.ok(!other.some((item) => item.id === mockId("appointment:lh-09")));
    assert.deepEqual(await studentAppointments("khong-phai-uuid"), []);
  });

  test("liên hệ cố vấn lớp sinh hoạt", async () => {
    const advisor = await studentAdvisor(CURRENT_STUDENT_ID);
    assert.equal(advisor?.email, "hanhpt@hcmue.edu.vn");
    assert.equal(advisor?.className, "50.01.CNTT.A");
    assert.equal(await studentAdvisor(STUDENT_ID), null);
  });

  test("chia sắp tới và đã qua", () => {
    const now = dayjs("2026-10-19T15:00:00");
    const base = { durationMinutes: 30, status: "scheduled" };
    const { upcoming, past } = splitAppointments(
      [
        { id: "a", date: "2026-10-19", startTime: "14:45", ...base },
        { id: "b", date: "2026-10-19", startTime: "14:00", ...base },
        { id: "c", date: "2026-10-25", startTime: "09:00", ...base },
        { id: "d", date: "2026-10-20", startTime: "09:00", ...base, status: "cancelled" },
        { id: "e", date: "2026-10-01", startTime: "09:00", ...base, status: "done" },
      ],
      now,
    );
    assert.deepEqual(
      upcoming.map((item) => item.id),
      ["a", "c"],
    );
    assert.deepEqual(
      past.map((item) => item.id),
      ["d", "b", "e"],
    );
  });
});

class Rollback extends Error {}

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

const rejectedIn = (tx: Transaction, run: (sp: Transaction) => Promise<unknown>) =>
  tx
    .transaction(async (sp) => void (await run(sp)))
    .then(() => "không lỗi")
    .catch((error: unknown) => (error instanceof AdvisingError ? error.message : `không phải AdvisingError: ${String(error)}`));

const later = (days: number) => dayjs().add(days, "day").format("YYYY-MM-DD");
const parseAppointment = (values: Record<string, unknown>) => {
  const parsed = parseInput(APPOINTMENT_SCHEMA, { ...appointment, studentIds: [CURRENT_STUDENT_ID], date: later(20), ...values });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.data;
};

const standaloneNote = (studentId: string) => {
  const parsed = parseInput(ADVISING_NOTE_SCHEMA, { studentId, topic: "Gọi điện", content: "Nhắc đăng ký học lại môn Xác suất thống kê" });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.data;
};

describe("advising: thao tác của cố vấn", () => {
  const advisor = { id: CURRENT_LECTURER_ID, displayName: "ThS. Phạm Thùy Hạnh" };

  test("đặt lịch trùng giờ buổi khác bị chặn ở server; dời lịch không trùng; chưa tới giờ thì không ghi nhận được", async () => {
    await inRollback(async (tx) => {
      const id = await createAppointmentFor(tx, advisor, parseAppointment({ startTime: "14:00", durationMinutes: 60 }));
      assert.match(await rejectedIn(tx, (sp) => createAppointmentFor(sp, advisor, parseAppointment({ startTime: "14:30" }))), /Trùng buổi hẹn/);
      const other = await createAppointmentFor(tx, advisor, parseAppointment({ startTime: "16:00" }));
      const move = (values: Record<string, unknown>) => {
        const parsed = parseInput(APPOINTMENT_RESCHEDULE_SCHEMA, { id: other, date: later(20), startTime: "16:00", durationMinutes: 30, location: "Phòng B.201", ...values });
        if (!parsed.ok) throw new Error(parsed.message);
        return parsed.data;
      };
      assert.match(await rejectedIn(tx, (sp) => rescheduleAppointment(sp, advisor, move({ startTime: "14:45" }))), /Trùng buổi hẹn/);
      await rescheduleAppointment(tx, advisor, move({ date: later(21), startTime: "08:00" }));
      const [moved] = await tx.select({ date: advisingAppointments.date }).from(advisingAppointments).where(eq(advisingAppointments.id, other));
      assert.equal(moved.date, later(21));
      const outcome = parseInput(APPOINTMENT_OUTCOME_SCHEMA, { id, attendance: { [CURRENT_STUDENT_ID]: "present" }, note: "Đã gặp" });
      assert.ok(outcome.ok);
      assert.match(await rejectedIn(tx, (sp) => recordAppointmentOutcome(sp, advisor.id, outcome.data)), /chưa diễn ra/);
    });
  });

  test("buổi nhóm đã qua: ghi có mặt, vắng từng người; ghi chú chỉ cho người có mặt; sinh viên vắng thấy Bạn vắng", async () => {
    const group = await db.select({ studentId: appointmentStudents.studentId }).from(appointmentStudents).where(eq(appointmentStudents.appointmentId, mockId("appointment:lh-03")));
    assert.equal(group.length, 3);
    const [present, ...absent] = group.map((row) => row.studentId);
    await inRollback(async (tx) => {
      // Đưa buổi hẹn nhóm sắp tới về quá khứ để ghi nhận được.
      await tx.update(advisingAppointments).set({ date: dayjs().subtract(1, "day").format("YYYY-MM-DD") }).where(eq(advisingAppointments.id, mockId("appointment:lh-03")));
      const missing = parseInput(APPOINTMENT_OUTCOME_SCHEMA, { id: mockId("appointment:lh-03"), attendance: { [present]: "present" }, note: "Sinh hoạt lớp" });
      assert.ok(missing.ok);
      assert.match(await rejectedIn(tx, (sp) => recordAppointmentOutcome(sp, advisor.id, missing.data)), /đủ từng sinh viên/);
      const full = parseInput(APPOINTMENT_OUTCOME_SCHEMA, {
        id: mockId("appointment:lh-03"),
        attendance: { [present]: "present", ...Object.fromEntries(absent.map((id) => [id, "absent"])) },
        note: "Phổ biến quy chế học vụ",
      });
      assert.ok(full.ok);
      const result = await recordAppointmentOutcome(tx, advisor.id, full.data);
      assert.equal(result.status, "done");
      const notes = await tx.select({ studentId: advisingNotes.studentId }).from(advisingNotes).where(eq(advisingNotes.appointmentId, mockId("appointment:lh-03")));
      assert.deepEqual(
        notes.map((row) => row.studentId),
        [present],
      );
      const marks = await tx.select({ studentId: appointmentStudents.studentId, attendance: appointmentStudents.attendance }).from(appointmentStudents).where(eq(appointmentStudents.appointmentId, mockId("appointment:lh-03")));
      assert.ok(marks.every((row) => row.attendance === (row.studentId === present ? "present" : "absent")));
      assert.match(await rejectedIn(tx, (sp) => recordAppointmentOutcome(sp, advisor.id, full.data)), /không còn ở trạng thái đã hẹn/);
    });
    // Seed: buổi nhóm lh-11 sinh viên 108 vắng, sinh viên hiện tại có mặt.
    const mine = await studentAppointments(CURRENT_STUDENT_ID);
    assert.equal(mine.find((item) => item.id === mockId("appointment:lh-11"))?.status, "done");
    const absentee = await studentAppointments(mockId("student:108"));
    assert.equal(absentee.find((item) => item.id === mockId("appointment:lh-11"))?.status, "missed");
  });

  test("ghi chú độc lập chỉ cho sinh viên mình cố vấn", async () => {
    await inRollback(async (tx) => {
      const id = await addAdvisingNote(tx, advisor.id, standaloneNote(CURRENT_STUDENT_ID));
      const [row] = await tx.select().from(advisingNotes).where(and(eq(advisingNotes.id, id), eq(advisingNotes.studentId, CURRENT_STUDENT_ID)));
      assert.equal(row.appointmentId, null);
      assert.match(await rejectedIn(tx, (sp) => addAdvisingNote(sp, advisor.id, standaloneNote(STUDENT_ID))), /lớp bạn cố vấn/);
    });
  });
});
