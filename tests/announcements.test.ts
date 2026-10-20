import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { ANNOUNCEMENTS_CONSTRAINT_MESSAGE } from "@/modules/announcements/announcements.constant";
import { announcementVisibleTo, ANNOUNCEMENT_SCHEMA, audienceLabel, draftBlockedReason, isPublicAudience, slugify, uniqueSlug } from "@/modules/announcements/announcements.rule";
import { announcements } from "@/modules/announcements/announcements.schema";

after(() => db.$client.end());

const valid = {
  title: "  Lịch thi cuối kỳ  ",
  category: "exam",
  audience: { students: true, lecturers: false, cohorts: [50, 49, 50], majorIds: [] },
  content: "Nội dung",
  isPinned: false,
  publishMode: "now",
} as const;

describe("announcements: đường dẫn và kiểm dữ liệu", () => {
  test("đường dẫn bỏ dấu, chữ thường, nối bằng gạch ngang; trùng thì thêm hậu tố", () => {
    assert.equal(slugify("Đăng ký học phần HK2, năm học 2026-2027!"), "dang-ky-hoc-phan-hk2-nam-hoc-2026-2027");
    assert.equal(slugify("!!!"), "thong-bao");
    assert.equal(uniqueSlug("lich-thi", ["lich-thi", "lich-thi-2"]), "lich-thi-3");
    assert.equal(uniqueSlug("lich-thi", []), "lich-thi");
  });

  test("chuẩn hoá tiêu đề, bỏ khóa trùng và xếp tăng dần, tóm tắt mặc định rỗng", () => {
    const parsed = parseInput(ANNOUNCEMENT_SCHEMA, valid);
    assert.ok(parsed.ok);
    assert.equal(parsed.data.title, "Lịch thi cuối kỳ");
    assert.deepEqual(parsed.data.audience, { students: true, lecturers: false, cohorts: [49, 50], facultyIds: [], majorIds: [] });
    assert.equal(parsed.data.notifyPortal, false);
    assert.equal(parsed.data.summary, "");
    assert.equal(parsed.data.deadline, null);
  });

  test("hẹn giờ phải có thời điểm đăng, đối tượng phải có trong danh sách", () => {
    const schedule = parseInput(ANNOUNCEMENT_SCHEMA, { ...valid, publishMode: "schedule" });
    assert.ok(!schedule.ok && schedule.fieldErrors?.publishedAt);
    const nobody = parseInput(ANNOUNCEMENT_SCHEMA, { ...valid, audience: { students: false, lecturers: false } });
    assert.ok(!nobody.ok && nobody.fieldErrors?.["audience.students"]);
    const badFaculty = parseInput(ANNOUNCEMENT_SCHEMA, { ...valid, audience: { students: true, facultyIds: ["khoa-cntt"] } });
    assert.ok(!badFaculty.ok && badFaculty.fieldErrors?.["audience.facultyIds.0"]);
  });
});

const audience = (value: Partial<Parameters<typeof announcementVisibleTo>[0]>) => ({ students: false, lecturers: false, cohorts: [], facultyIds: [], majorIds: [], ...value });

describe("announcements: đối tượng có cấu trúc", () => {
  const CNTT = "0192f3a4-0000-7000-8000-00000000000a";
  const TOAN = "0192f3a4-0000-7000-8000-00000000000b";
  const MAJOR = "0192f3a4-0000-7000-8000-00000000000c";
  const student = { kind: "student" as const, cohort: 50, majorId: MAJOR, facultyId: CNTT };
  const lecturer = { kind: "lecturer" as const, facultyId: TOAN };

  test("sinh viên thấy thông báo đúng khóa, ngành, khoa; giảng viên thấy theo khoa", () => {
    assert.ok(announcementVisibleTo(audience({ students: true }), student));
    assert.ok(announcementVisibleTo(audience({ students: true, cohorts: [49, 50] }), student));
    assert.ok(!announcementVisibleTo(audience({ students: true, cohorts: [48] }), student));
    assert.ok(!announcementVisibleTo(audience({ students: true, facultyIds: [TOAN] }), student));
    assert.ok(announcementVisibleTo(audience({ students: true, majorIds: [MAJOR] }), student));
    assert.ok(!announcementVisibleTo(audience({ lecturers: true }), student));
    assert.ok(announcementVisibleTo(audience({ lecturers: true, facultyIds: [TOAN] }), lecturer));
    assert.ok(!announcementVisibleTo(audience({ lecturers: true, facultyIds: [CNTT] }), lecturer));
    assert.ok(!announcementVisibleTo(audience({ students: true, cohorts: [50] }), lecturer));
  });

  test("thông báo chỉ cho giảng viên không công khai; nhãn đối tượng ghép tên khoa, ngành", () => {
    assert.ok(!isPublicAudience(audience({ lecturers: true })));
    assert.ok(isPublicAudience(audience({ students: true })));
    const names = { faculties: new Map([[CNTT, "Khoa Công nghệ Thông tin"]]), majors: new Map([[MAJOR, "Công nghệ thông tin"]]) };
    assert.equal(audienceLabel(audience({ students: true, lecturers: true }), names), "Toàn trường");
    assert.equal(audienceLabel(audience({ students: true, cohorts: [50, 51], facultyIds: [CNTT] }), names), "Sinh viên khóa 50, 51 · Khoa Công nghệ Thông tin");
    assert.equal(audienceLabel(audience({ students: true, majorIds: [MAJOR] }), names), "Sinh viên ngành Công nghệ thông tin");
    assert.equal(audienceLabel(audience({ lecturers: true }), names), "Giảng viên");
  });

  test("thông báo đã đăng hoặc đã gỡ không đưa về nháp", () => {
    assert.match(draftBlockedReason("published", "draft") ?? "", /không lưu nháp lại/);
    assert.match(draftBlockedReason("archived", "draft") ?? "", /không lưu nháp lại/);
    assert.equal(draftBlockedReason("scheduled", "draft"), null);
    assert.equal(draftBlockedReason("published", "published"), null);
    assert.equal(draftBlockedReason(null, "draft"), null);
  });
});

describe("announcements: ràng buộc ở DB", () => {
  test("đường dẫn sai định dạng hoặc trùng bị chặn", async () => {
    const [first, second] = await db.select().from(announcements).limit(2);
    const format = await db
      .update(announcements)
      .set({ slug: "Có Dấu" })
      .where(eq(announcements.id, first.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(format, ANNOUNCEMENTS_CONSTRAINT_MESSAGE), ANNOUNCEMENTS_CONSTRAINT_MESSAGE.announcements_slug_format);
    const duplicate = await db
      .update(announcements)
      .set({ slug: first.slug })
      .where(eq(announcements.id, second.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(duplicate, ANNOUNCEMENTS_CONSTRAINT_MESSAGE), ANNOUNCEMENTS_CONSTRAINT_MESSAGE.announcements_slug_unique);
  });

  test("đã đăng thì phải có thời điểm đăng", async () => {
    const [published] = await db.select().from(announcements).where(eq(announcements.status, "published")).limit(1);
    const error = await db
      .update(announcements)
      .set({ publishedAt: null })
      .where(eq(announcements.id, published.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, ANNOUNCEMENTS_CONSTRAINT_MESSAGE), ANNOUNCEMENTS_CONSTRAINT_MESSAGE.announcements_published_fields);
  });
});
