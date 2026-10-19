import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { enrollments, labGroups } from "@/modules/course-registration/course-registration.schema";
import { SCHEDULE_CONSTRAINT_MESSAGE } from "@/modules/schedule/schedule.constant";
import { ATTENDANCE_SAVE_SCHEMA, datesOnWeekday, isAbsence, isNearAbsenceLimit, isOverAbsenceLimit, planClassSessions } from "@/modules/schedule/schedule.rule";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";

after(() => db.$client.end());

const failure = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught);

const STUDENT = "0192f3a4-0000-7000-8000-000000000001";
const SESSION = "0192f3a4-0000-7000-8000-000000000002";

describe("schedule: sinh buổi học từ lịch tuần", () => {
  test("ngày theo thứ trong khoảng ngày học, chủ nhật là thứ 8", () => {
    assert.deepEqual(datesOnWeekday(5, "2026-09-07", "2026-09-30"), ["2026-09-10", "2026-09-17", "2026-09-24"]);
    assert.deepEqual(datesOnWeekday(8, "2026-09-07", "2026-09-20"), ["2026-09-13", "2026-09-20"]);
    assert.deepEqual(datesOnWeekday(2, "2026-09-08", "2026-09-13"), []);
  });

  test("buổi lý thuyết cho cả lớp, buổi thực hành gắn nhóm, xếp theo ngày rồi tiết", () => {
    const plans = planClassSessions({
      id: "lop",
      startDate: "2026-09-07",
      endDate: "2026-09-20",
      meetings: [{ dayOfWeek: 5, startPeriod: 7, endPeriod: 9, roomId: "a201" }],
      labGroups: [{ id: "th1", dayOfWeek: 2, startPeriod: 1, endPeriod: 3, roomId: "c301" }],
    });
    assert.deepEqual(
      plans.map((plan) => [plan.date, plan.labGroupId, plan.roomId]),
      [
        ["2026-09-07", "th1", "c301"],
        ["2026-09-10", null, "a201"],
        ["2026-09-14", "th1", "c301"],
        ["2026-09-17", null, "a201"],
      ],
    );
  });
});

describe("schedule: tỉ lệ vắng", () => {
  test("vắng có phép vẫn tính là vắng, đi trễ thì không", () => {
    assert.equal(isAbsence("excused"), true);
    assert.equal(isAbsence("absent"), true);
    assert.equal(isAbsence("late"), false);
    assert.equal(isAbsence(undefined), false);
  });

  test("cấm thi khi vắng từ ngưỡng trở lên, nhắc khi vắng thêm một buổi là chạm ngưỡng", () => {
    assert.equal(isOverAbsenceLimit(2, 10, 20), true);
    assert.equal(isOverAbsenceLimit(1, 10, 20), false);
    assert.equal(isOverAbsenceLimit(0, 0, 20), false);
    assert.equal(isNearAbsenceLimit(1, 10, 20), true);
    assert.equal(isNearAbsenceLimit(2, 10, 20), false);
    assert.equal(isNearAbsenceLimit(0, 10, 20), false);
  });

  test("lưu điểm danh: trạng thái hợp lệ, mỗi sinh viên một lần", () => {
    assert.ok(parseInput(ATTENDANCE_SAVE_SCHEMA, { classSessionId: SESSION, records: [{ studentId: STUDENT, status: "late" }] }).ok);
    const duplicate = parseInput(ATTENDANCE_SAVE_SCHEMA, {
      classSessionId: SESSION,
      records: [
        { studentId: STUDENT, status: "present" },
        { studentId: STUDENT, status: "absent" },
      ],
    });
    assert.ok(!duplicate.ok && duplicate.fieldErrors?.records);
    const bad = parseInput(ATTENDANCE_SAVE_SCHEMA, { classSessionId: "buoi-1", records: [{ studentId: STUDENT, status: "sick" }] });
    assert.ok(!bad.ok);
    assert.deepEqual(Object.keys(bad.fieldErrors ?? {}).toSorted(), ["classSessionId", "records.0.status"]);
  });
});

describe("schedule: ràng buộc ở DB", () => {
  test("không điểm danh sinh viên của lớp khác (trigger attendance_records_same_section)", async () => {
    const [session] = await db.select().from(classSessions).where(isNotNull(classSessions.takenAt)).limit(1);
    const [outsider] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(ne(enrollments.classSectionId, session.classSectionId), eq(enrollments.status, "enrolled")))
      .limit(1);
    const error = await failure(db.insert(attendanceRecords).values({ classSessionId: session.id, enrollmentId: outsider.id, status: "present" }));
    assert.equal(pgErrorMessage(error, SCHEDULE_CONSTRAINT_MESSAGE), SCHEDULE_CONSTRAINT_MESSAGE.attendance_records_same_section);
  });

  test("một lớp không có hai buổi cùng ngày, cùng tiết bắt đầu", async () => {
    const [session] = await db.select().from(classSessions).limit(1);
    const { id: _id, ...copy } = session;
    const error = await failure(db.insert(classSessions).values(copy));
    assert.equal(pgErrorMessage(error, SCHEDULE_CONSTRAINT_MESSAGE), SCHEDULE_CONSTRAINT_MESSAGE.class_sessions_slot_unique);
  });

  test("buổi thực hành phải của nhóm thuộc chính lớp đó", async () => {
    const [lab] = await db.select().from(labGroups).limit(1);
    const [session] = await db.select().from(classSessions).where(ne(classSessions.classSectionId, lab.classSectionId)).limit(1);
    const error = await failure(db.update(classSessions).set({ labGroupId: lab.id }).where(eq(classSessions.id, session.id)));
    assert.equal(pgErrorMessage(error, SCHEDULE_CONSTRAINT_MESSAGE), SCHEDULE_CONSTRAINT_MESSAGE.class_sessions_lab_group_fk);
  });

  test("tiết học ngoài 1..12 bị chặn", async () => {
    const [session] = await db.select().from(classSessions).limit(1);
    const error = await failure(db.update(classSessions).set({ endPeriod: 13 }).where(eq(classSessions.id, session.id)));
    assert.equal(pgErrorMessage(error, SCHEDULE_CONSTRAINT_MESSAGE), SCHEDULE_CONSTRAINT_MESSAGE.class_sessions_period_range);
  });
});
