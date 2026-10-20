import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, asc, eq, gte, isNotNull, isNull, like, lt, ne, sql, TransactionRollbackError } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { weekdayOf } from "@/shared/libs/date.lib";
import { classSections, enrollments, labGroups, sectionMeetings } from "@/modules/course-registration/course-registration.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { syncClassSessions, weeklyScheduleOf } from "@/modules/schedule/schedule.lib";
import { SCHEDULE_CONSTRAINT_MESSAGE } from "@/modules/schedule/schedule.constant";
import { ATTENDANCE_SAVE_SCHEMA, datesOnWeekday, diffClassSessions, isAbsence, isNearAbsenceLimit, isOverAbsenceLimit, planClassSessions, type ExistingSession } from "@/modules/schedule/schedule.rule";
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

function slotPlan(date: string, startPeriod = 1, roomId = "a101") {
  return { classSectionId: "lop", labGroupId: null, date, startPeriod, endPeriod: startPeriod + 2, roomId };
}

function existing(id: string, date: string, isTaken = false, startPeriod = 1, roomId = "a101"): ExistingSession {
  return { ...slotPlan(date, startPeriod, roomId), id, isTaken };
}

describe("schedule: sinh lại buổi học khi đổi lịch tuần", () => {

  test("giữ buổi đã qua và buổi đã điểm danh, bỏ buổi tương lai không còn trong lịch, thêm buổi mới, buổi trùng hệt giữ nguyên", () => {
    const diff = diffClassSessions(
      [existing("qua", "2026-10-12", true), existing("qua-chua-diem-danh", "2026-10-13"), existing("da-diem-danh", "2026-10-26", true), existing("cu", "2026-10-21"), existing("giu", "2026-10-28", false, 4, "b202")],
      [slotPlan("2026-10-14"), slotPlan("2026-10-26"), slotPlan("2026-10-28", 4, "b202"), slotPlan("2026-11-02")],
      "2026-10-19",
    );
    assert.deepEqual(diff.removeIds, ["cu"]);
    assert.deepEqual(
      diff.add.map((entry) => entry.date),
      ["2026-11-02"],
    );
    assert.equal(diff.kept, 4);
  });

  test("đổi phòng của buổi tương lai: bỏ buổi cũ, sinh lại cùng ngày với phòng mới", () => {
    const diff = diffClassSessions([existing("cu", "2026-10-21", false, 1, "a101")], [slotPlan("2026-10-21", 1, "c303")], "2026-10-19");
    assert.deepEqual(diff.removeIds, ["cu"]);
    assert.equal(diff.add[0].roomId, "c303");
  });

  test("trên DB: đổi thứ học của lớp đang mở thì buổi tương lai chuyển sang thứ mới, buổi đã điểm danh còn nguyên, sinh viên được báo", async () => {
    await db
      .transaction(async (tx) => {
        const [{ today }] = await tx.execute<{ today: string }>(sql`SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today`);
        const [section] = await tx
          .select({ id: classSections.id, code: classSections.code })
          .from(classSections)
          .where(
            and(
              eq(classSections.status, "open"),
              sql`${classSections.endDate} > ${today}::date + 21`,
              // Lớp có sinh viên đã có tài khoản cổng để kiểm thông báo đổi lịch.
              sql`EXISTS (SELECT 1 FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.class_section_id = ${classSections.id} AND e.status = 'enrolled' AND s.user_id IS NOT NULL)`,
            ),
          )
          .orderBy(asc(classSections.code))
          .limit(1);
        const meetings = await tx.select().from(sectionMeetings).where(eq(sectionMeetings.classSectionId, section.id));
        const future = await tx
          .select()
          .from(classSessions)
          .where(and(eq(classSessions.classSectionId, section.id), isNull(classSessions.labGroupId), gte(classSessions.date, today), isNull(classSessions.takenAt)))
          .orderBy(asc(classSessions.date));
        const pastCount = (await tx.select({ id: classSessions.id }).from(classSessions).where(and(eq(classSessions.classSectionId, section.id), lt(classSessions.date, today)))).length;
        // Một buổi tương lai đã có điểm danh (ví dụ điểm danh bù) phải được giữ dù lịch đổi.
        const attended = future[1];
        const [member] = await tx
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.status, "enrolled"), isNull(enrollments.labGroupId)))
          .limit(1);
        await tx.insert(attendanceRecords).values({ classSessionId: attended.id, enrollmentId: member.id, status: "present" });

        const previous = await weeklyScheduleOf(tx, section.id);
        const used = new Set(meetings.map((meeting) => meeting.dayOfWeek));
        const newDay = [2, 3, 4, 5, 6, 7].find((day) => !used.has(day))!;
        await tx.update(sectionMeetings).set({ dayOfWeek: newDay }).where(eq(sectionMeetings.id, meetings[0].id));
        const result = await syncClassSessions(tx, section.id, { previous });
        assert.ok(result.removed > 0 && result.added > 0 && result.notified);

        const sessions = await tx.select().from(classSessions).where(eq(classSessions.classSectionId, section.id));
        assert.equal(sessions.filter((session) => session.date < today).length, pastCount);
        assert.ok(sessions.some((session) => session.id === attended.id));
        const regenerated = sessions.filter((session) => session.labGroupId === null && session.date >= today && session.id !== attended.id && session.startPeriod === meetings[0].startPeriod);
        assert.ok(regenerated.some((session) => weekdayOf(session.date) === newDay));
        if (meetings.length === 1) assert.ok(regenerated.every((session) => weekdayOf(session.date) === newDay));
        const sent = await tx.select({ id: notifications.id }).from(notifications).where(like(notifications.title, `Lớp ${section.code} đổi lịch%`));
        assert.ok(sent.length > 0);

        // Lưu lại mà lịch không đổi thì không sinh lại, không báo.
        const again = await syncClassSessions(tx, section.id, { previous: await weeklyScheduleOf(tx, section.id) });
        assert.deepEqual([again.added, again.removed, again.notified], [0, 0, false]);
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
  });
});
