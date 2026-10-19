import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { mockSectionId } from "@/shared/libs/mock.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { assessmentMismatches, TEACHING_CONSTRAINT_MESSAGE } from "@/modules/teaching/teaching.constant";
import { CLASS_ANNOUNCEMENT_SCHEMA, effectiveAnnouncementStatus, SYLLABUS_SCHEMA } from "@/modules/teaching/teaching.rule";
import { classAnnouncementReads, syllabi, syllabusAssessments, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import { students } from "@/modules/users/users.schema";

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
