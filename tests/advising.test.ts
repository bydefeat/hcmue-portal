import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { mockId } from "@/shared/libs/mock.lib";
import { studentAdvisor, studentAppointments } from "@/modules/advising/advising.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { ADVISING_CONSTRAINT_MESSAGE } from "@/modules/advising/advising.constant";
import { APPOINTMENT_DONE_SCHEMA, APPOINTMENT_SCHEMA, appointmentsOverlap, splitAppointments } from "@/modules/advising/advising.rule";
import { advisingAppointments, appointmentStudents } from "@/modules/advising/advising.schema";
import { CURRENT_STUDENT_ID } from "@/modules/users/users.mock";

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

  test("ghi nhận đã gặp phải có nội dung, việc theo dõi để trống thành null", () => {
    const parsed = parseInput(APPOINTMENT_DONE_SCHEMA, { id: STUDENT_ID, note: " Đã trao đổi ", followUp: "  " });
    assert.ok(parsed.ok && parsed.data.followUp === null && parsed.data.note === "Đã trao đổi");
    const empty = parseInput(APPOINTMENT_DONE_SCHEMA, { id: STUDENT_ID, note: " " });
    assert.equal(!empty.ok && empty.fieldErrors?.note, "Ghi lại nội dung chính đã trao đổi");
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
