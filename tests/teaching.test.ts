import assert from "node:assert/strict";
import { after, describe, mock, test } from "node:test";
import { and, eq, inArray, isNotNull, ne, notInArray, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { mockId, mockSectionId } from "@/shared/libs/mock.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { mailOutbox } from "@/modules/mail/mail.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { assessmentMismatches, TEACHING_CONSTRAINT_MESSAGE } from "@/modules/teaching/teaching.constant";
import { CLASS_ANNOUNCEMENT_SCHEMA, effectiveAnnouncementStatus, SYLLABUS_SCHEMA } from "@/modules/teaching/teaching.rule";
import {
  lecturerAnnouncements,
  lecturerClass,
  lecturerSyllabus,
  publishDueClassAnnouncements,
  recordAnnouncementRead,
  studentAnnouncements,
  studentClass,
  studentClasses,
  studentSyllabus,
} from "@/modules/teaching/teaching.lib";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID } from "@/modules/users/users.mock";
import { lecturers, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const SECTION_ID = mockSectionId("hk1-2026", "COMP1020.01");

const syllabus = {
  classSectionId: SECTION_ID,
  description: "  Mô tả  ",
  outcomes: [{ text: "Phân tích độ phức tạp" }, { text: "Cài đặt cấu trúc dữ liệu" }],
  weeks: [
    { week: 2, topic: "Mảng", activities: "", readings: "" },
    { week: 1, topic: "Giới thiệu", activities: "", readings: "" },
  ],
  assessments: [
    { key: "midterm", label: "Giữa kỳ", weight: 40, method: "Tự luận", outcomes: ["CLO1", "CLO1", "CLO5"] },
    { key: "final", label: "Cuối kỳ", weight: 60, method: "Tự luận", outcomes: ["CLO2"] },
  ],
  references: ["Giáo trình", " "],
};

describe("teaching: kiểm dữ liệu đề cương", () => {
  test("đánh số lại chuẩn đầu ra, bỏ mã chuẩn không còn, sắp tuần, bỏ tài liệu trống", () => {
    const parsed = parseInput(SYLLABUS_SCHEMA, syllabus);
    assert.ok(parsed.ok);
    assert.deepEqual(
      parsed.data.outcomes.map((outcome) => outcome.code),
      ["CLO1", "CLO2"],
    );
    assert.deepEqual(parsed.data.assessments[0].outcomes, ["CLO1"]);
    assert.deepEqual(
      parsed.data.weeks.map((week) => week.week),
      [1, 2],
    );
    assert.deepEqual(parsed.data.references, ["Giáo trình"]);
    assert.equal(parsed.data.description, "Mô tả");
  });

  test("tổng trọng số khác 100 bị chặn, đề cương chưa có đánh giá thì lưu được", () => {
    const wrong = parseInput(SYLLABUS_SCHEMA, { ...syllabus, assessments: [{ ...syllabus.assessments[0], weight: 30 }, syllabus.assessments[1]] });
    assert.ok(!wrong.ok);
    assert.equal(!wrong.ok && wrong.fieldErrors?.assessments, "Tổng trọng số đang là 90%, cần đúng 100%.");
    assert.ok(parseInput(SYLLABUS_SCHEMA, { ...syllabus, assessments: [] }).ok);
  });

  test("trọng số 0, trùng hình thức, trùng tuần báo theo ô", () => {
    const parsed = parseInput(SYLLABUS_SCHEMA, {
      ...syllabus,
      weeks: [syllabus.weeks[0], syllabus.weeks[0]],
      assessments: [{ ...syllabus.assessments[0], weight: 0 }, syllabus.assessments[0]],
    });
    assert.ok(!parsed.ok);
    const fields = Object.keys((!parsed.ok && parsed.fieldErrors) || {});
    assert.ok(fields.includes("assessments.0.weight"));
    assert.ok(fields.includes("weeks"));
  });

  test("so đề cương với bảng điểm", () => {
    const messages = assessmentMismatches(
      [
        { key: "midterm", label: "Giữa kỳ", weight: 40, method: "", outcomes: [] },
        { key: "final", label: "Cuối kỳ", weight: 60, method: "", outcomes: [] },
      ],
      [
        { key: "midterm", label: "Giữa kỳ", weight: 30 },
        { key: "final", label: "Cuối kỳ", weight: 60 },
        { key: "attendance", label: "Chuyên cần", weight: 10 },
      ],
    );
    assert.deepEqual(messages, ['"Giữa kỳ": đề cương 40%, bảng điểm 30%.', 'Bảng điểm có cột "Chuyên cần" (10%) nhưng đề cương chưa có.']);
  });
});

describe("teaching: thông báo lớp", () => {
  const announcement = { classSectionId: SECTION_ID, title: " Nghỉ học ", body: "Nghỉ buổi thứ 2", isPinned: false, sendEmail: false, schedule: false };

  test("đăng ngay không cần thời điểm; hẹn giờ phải có thời điểm sau hiện tại", () => {
    const now = parseInput(CLASS_ANNOUNCEMENT_SCHEMA, announcement);
    assert.ok(now.ok && now.data.title === "Nghỉ học");
    const missing = parseInput(CLASS_ANNOUNCEMENT_SCHEMA, { ...announcement, schedule: true });
    assert.equal(!missing.ok && missing.fieldErrors?.publishAt, "Chọn thời điểm đăng");
    const past = parseInput(CLASS_ANNOUNCEMENT_SCHEMA, { ...announcement, schedule: true, publishAt: "2020-01-01T00:00:00.000Z" });
    assert.equal(!past.ok && past.fieldErrors?.publishAt, "Thời điểm đăng phải sau hiện tại");
    const later = parseInput(CLASS_ANNOUNCEMENT_SCHEMA, { ...announcement, schedule: true, publishAt: new Date(Date.now() + 3_600_000).toISOString() });
    assert.ok(later.ok);
  });

  test("thông báo hẹn giờ tự thành đã đăng khi tới giờ", () => {
    const now = new Date("2026-10-19T08:00:00Z");
    assert.equal(effectiveAnnouncementStatus("scheduled", new Date("2026-10-19T07:00:00Z"), now), "published");
    assert.equal(effectiveAnnouncementStatus("scheduled", new Date("2026-10-20T07:00:00Z"), now), "scheduled");
    assert.equal(effectiveAnnouncementStatus("published", new Date("2026-10-20T07:00:00Z"), now), "published");
  });
});

describe("teaching: ràng buộc ở DB", () => {
  test("tổng trọng số đề cương khác 100 bị trigger chặn lúc commit", async () => {
    const [row] = await db.select({ id: syllabi.id }).from(syllabi).where(eq(syllabi.classSectionId, SECTION_ID));
    const error = await db
      .transaction(async (tx) => {
        await tx.update(syllabusAssessments).set({ weight: 5 }).where(eq(syllabusAssessments.syllabusId, row.id));
      })
      .catch((caught: unknown) => caught);
    assert.match(pgErrorMessage(error, TEACHING_CONSTRAINT_MESSAGE), /phải bằng 100/);
  });

  test("trọng số, tuần ngoài khoảng và đề cương công bố thiếu thời điểm trả câu của module", async () => {
    const [row] = await db.select({ id: syllabi.id }).from(syllabi).where(eq(syllabi.classSectionId, SECTION_ID));
    const weight = await db
      .insert(syllabusAssessments)
      .values({ syllabusId: row.id, key: "extra", label: "Thêm", weight: 0, method: "", position: 99 })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(weight, TEACHING_CONSTRAINT_MESSAGE), TEACHING_CONSTRAINT_MESSAGE.syllabus_assessments_weight_range);
    const week = await db
      .insert(syllabusWeeks)
      .values({ syllabusId: row.id, week: 21, topic: "" })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(week, TEACHING_CONSTRAINT_MESSAGE), TEACHING_CONSTRAINT_MESSAGE.syllabus_weeks_week_range);
    const published = await db
      .update(syllabi)
      .set({ publishedAt: null })
      .where(eq(syllabi.id, row.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(published, TEACHING_CONSTRAINT_MESSAGE), TEACHING_CONSTRAINT_MESSAGE.syllabi_published_fields);
    const duplicate = await db
      .insert(syllabi)
      .values({ classSectionId: SECTION_ID })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(duplicate, TEACHING_CONSTRAINT_MESSAGE), TEACHING_CONSTRAINT_MESSAGE.syllabi_class_section_id_unique);
  });

  test("một sinh viên chỉ có một lượt đã đọc mỗi thông báo", async () => {
    const [read] = await db.select().from(classAnnouncementReads).limit(1);
    const error = await db
      .insert(classAnnouncementReads)
      .values({ classAnnouncementId: read.classAnnouncementId, studentId: read.studentId })
      .catch((caught: unknown) => caught);
    assert.ok(error instanceof Error);
    const [student] = await db.select({ id: students.id }).from(students).limit(1);
    const missing = await db
      .insert(classAnnouncementReads)
      .values({ classAnnouncementId: "01940000-0000-7000-8000-000000000000", studentId: student.id })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(missing, TEACHING_CONSTRAINT_MESSAGE), TEACHING_CONSTRAINT_MESSAGE.class_announcement_reads_announcement_fk);
  });
});

// Lớp của sinh viên seed 50.01.104.009: có đề cương đã công bố, một bài đã đọc được, một bài chưa đọc, một bài hẹn giờ.
const MY_SECTION_ID = mockSectionId("hk1-2026", "COMP1020.02");
const UNREAD_ID = mockId("class-announcement:tbl-07");
const SCHEDULED_ID = mockId("class-announcement:tbl-08");

async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

async function outsiderStudentId() {
  const members = db.select({ id: enrollments.studentId }).from(enrollments).where(eq(enrollments.classSectionId, MY_SECTION_ID));
  const [outsider] = await db.select({ id: students.id }).from(students).where(notInArray(students.id, members)).limit(1);
  return outsider.id;
}

async function otherLecturerId() {
  const [other] = await db.select({ id: lecturers.id }).from(lecturers).where(ne(lecturers.id, CURRENT_LECTURER_ID)).limit(1);
  return other.id;
}

describe("teaching: lớp học phần của sinh viên", () => {
  test("danh sách học kỳ hiện tại có lớp đang học, kèm giảng viên và số chưa đọc", async () => {
    const classes = await studentClasses(CURRENT_STUDENT_ID);
    const mine = classes.find((section) => section.id === MY_SECTION_ID);
    assert.ok(mine, "sinh viên seed học lớp COMP1020.02");
    assert.equal(mine.lecturer?.email, "hanhpt@hcmue.edu.vn");
    assert.ok(mine.unreadCount >= 1);
    assert.ok(mine.unreadCount <= mine.announcementCount);
  });

  test("sinh viên chỉ thấy bài đã tới giờ đăng, ghim lên đầu; đề cương đã công bố", async () => {
    const announcements = await studentAnnouncements(CURRENT_STUDENT_ID, MY_SECTION_ID);
    const ids = announcements.map((announcement) => announcement.id);
    assert.ok(ids.includes(UNREAD_ID));
    assert.ok(!ids.includes(SCHEDULED_ID), "bài hẹn giờ chưa tới giờ không hiện cho sinh viên");
    assert.equal(announcements[0].isPinned, true);
    const published = await studentSyllabus(CURRENT_STUDENT_ID, MY_SECTION_ID);
    assert.equal(published?.status, "published");
  });

  test("đọc thông báo làm giảm số chưa đọc; đọc lại không ghi thêm", async () => {
    await inRollback(async (tx) => {
      const before = await studentClass(CURRENT_STUDENT_ID, MY_SECTION_ID, tx);
      assert.ok(await recordAnnouncementRead(CURRENT_STUDENT_ID, UNREAD_ID, tx));
      assert.ok(await recordAnnouncementRead(CURRENT_STUDENT_ID, UNREAD_ID, tx));
      const afterRead = await studentClass(CURRENT_STUDENT_ID, MY_SECTION_ID, tx);
      assert.equal(afterRead?.unreadCount, (before?.unreadCount ?? 0) - 1);
      assert.ok(!(await recordAnnouncementRead(CURRENT_STUDENT_ID, SCHEDULED_ID, tx)), "bài chưa tới giờ không đánh dấu đọc được");
    });
  });

  test("sinh viên ngoài lớp không đọc được lớp, thông báo, đề cương", async () => {
    const outsider = await outsiderStudentId();
    assert.equal(await studentClass(outsider, MY_SECTION_ID), null);
    assert.deepEqual(await studentAnnouncements(outsider, MY_SECTION_ID), []);
    assert.equal(await studentSyllabus(outsider, MY_SECTION_ID), null);
    await inRollback(async (tx) => {
      assert.equal(await recordAnnouncementRead(outsider, UNREAD_ID, tx), false);
    });
  });

  test("giảng viên dạy lớp thấy cả bài hẹn giờ và đề cương; giảng viên khác nhận null", async () => {
    assert.ok(await lecturerClass(CURRENT_LECTURER_ID, MY_SECTION_ID));
    const own = await lecturerAnnouncements(CURRENT_LECTURER_ID, MY_SECTION_ID);
    assert.ok(own?.some((announcement) => announcement.id === SCHEDULED_ID && announcement.status === "scheduled"));
    assert.ok((await lecturerSyllabus(CURRENT_LECTURER_ID, MY_SECTION_ID))?.syllabus);
    const other = await otherLecturerId();
    const [teaches] = await db.select({ id: classSections.id }).from(classSections).where(and(eq(classSections.id, MY_SECTION_ID), eq(classSections.lecturerId, other)));
    assert.equal(teaches, undefined);
    assert.equal(await lecturerClass(other, MY_SECTION_ID), null);
    assert.equal(await lecturerAnnouncements(other, MY_SECTION_ID), null);
    assert.equal(await lecturerSyllabus(other, MY_SECTION_ID), null);
  });
});

describe("teaching: báo thông báo lớp hẹn giờ", () => {
  // Dùng bài hẹn giờ có sẵn của seed (không thêm dòng để tests/seed.test.ts chạy song song vẫn đếm đúng), trả lại như cũ sau khi thử.
  const ID = mockId("class-announcement:tbl-03");
  const SECTION_ID_03 = mockSectionId("hk1-2026", "COMP1020.01");

  test("chạy hai lần song song chỉ báo một lần, dòng đang bị khóa thì bỏ qua, gửi email cả lớp", async () => {
    const [original] = await db.select().from(classAnnouncements).where(eq(classAnnouncements.id, ID));
    assert.equal(original.status, "scheduled");
    assert.equal(original.notifiedAt, null);
    const warn = mock.method(console, "warn", () => {});
    try {
      await db.update(classAnnouncements).set({ publishAt: new Date(Date.now() - 60_000) }).where(eq(classAnnouncements.id, ID));

      // Một transaction khác đang giữ khóa dòng (giảng viên đang sửa): tác vụ bỏ qua, không chờ, không báo.
      await db.transaction(async (tx) => {
        await tx.select({ id: classAnnouncements.id }).from(classAnnouncements).where(eq(classAnnouncements.id, ID)).for("update");
        const skipped = await publishDueClassAnnouncements({ classSectionId: SECTION_ID_03 });
        assert.equal(skipped.announcements, 0);
      });

      const runs = await Promise.all([publishDueClassAnnouncements({ classSectionId: SECTION_ID_03 }), publishDueClassAnnouncements({ classSectionId: SECTION_ID_03 })]);
      assert.equal(runs[0].announcements + runs[1].announcements, 1);
      const again = await publishDueClassAnnouncements({ classSectionId: SECTION_ID_03 });
      assert.equal(again.announcements, 0);

      const roster = await db
        .select({ userId: students.userId, email: students.email })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .where(and(eq(enrollments.classSectionId, SECTION_ID_03), eq(enrollments.status, "enrolled")));
      const withAccount = roster.flatMap((row) => (row.userId ? [row.userId] : []));
      const sent = await db
        .select({ userId: notifications.recipientUserId, href: notifications.href })
        .from(notifications)
        .where(and(eq(notifications.title, `COMP1020.01: ${original.title}`), inArray(notifications.recipientUserId, withAccount)));
      assert.equal(sent.length, withAccount.length, "mỗi sinh viên có tài khoản nhận đúng một thông báo");
      assert.ok(sent.every((row) => row.href === `/application/classes/${SECTION_ID_03}`));
      assert.equal(runs[0].emailed + runs[1].emailed, roster.length, "email tới mọi sinh viên đang học, kể cả chưa có tài khoản");
      // Thư đi qua hàng đợi: mỗi sinh viên một dòng, đã gửi (chưa có khóa Resend thì in ra log và coi như gửi được).
      const queued = await db.select({ recipient: mailOutbox.recipient, status: mailOutbox.status, kind: mailOutbox.kind }).from(mailOutbox).where(eq(mailOutbox.subject, `[COMP1020.01] ${original.title}`));
      assert.deepEqual(queued.map((row) => row.recipient).toSorted(), roster.map((row) => row.email).toSorted());
      assert.ok(queued.every((row) => row.status === "sent" && row.kind === "class-announcement"));

      const [updated] = await db.select({ status: classAnnouncements.status, notifiedAt: classAnnouncements.notifiedAt }).from(classAnnouncements).where(eq(classAnnouncements.id, ID));
      assert.equal(updated.status, "published");
      assert.ok(updated.notifiedAt);
    } finally {
      warn.mock.restore();
      await db.delete(notifications).where(eq(notifications.title, `COMP1020.01: ${original.title}`));
      await db.delete(mailOutbox).where(eq(mailOutbox.subject, `[COMP1020.01] ${original.title}`));
      await db.update(classAnnouncements).set({ status: original.status, publishAt: original.publishAt, notifiedAt: null }).where(eq(classAnnouncements.id, ID));
    }
  });

  test("bài đã báo không chuyển lại thành hẹn giờ được (ràng buộc DB)", async () => {
    const [published] = await db.select({ id: classAnnouncements.id }).from(classAnnouncements).where(isNotNull(classAnnouncements.notifiedAt)).limit(1);
    const error = await db
      .update(classAnnouncements)
      .set({ status: "scheduled" })
      .where(eq(classAnnouncements.id, published.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, TEACHING_CONSTRAINT_MESSAGE), TEACHING_CONSTRAINT_MESSAGE.class_announcements_notified_published);
  });
});
