import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { ANNOUNCEMENTS_CONSTRAINT_MESSAGE } from "@/modules/announcements/announcements.constant";
import { ANNOUNCEMENT_SCHEMA, slugify, uniqueSlug } from "@/modules/announcements/announcements.rule";
import { announcements } from "@/modules/announcements/announcements.schema";

after(() => db.$client.end());

const valid = {
  title: "  Lịch thi cuối kỳ  ",
  category: "exam",
  audiences: ["Sinh viên", "Sinh viên"],
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

  test("chuẩn hoá tiêu đề, bỏ đối tượng trùng, tóm tắt mặc định rỗng", () => {
    const parsed = parseInput(ANNOUNCEMENT_SCHEMA, valid);
    assert.ok(parsed.ok);
    assert.equal(parsed.data.title, "Lịch thi cuối kỳ");
    assert.deepEqual(parsed.data.audiences, ["Sinh viên"]);
    assert.equal(parsed.data.summary, "");
    assert.equal(parsed.data.deadline, null);
  });

  test("hẹn giờ phải có thời điểm đăng, đối tượng phải có trong danh sách", () => {
    const schedule = parseInput(ANNOUNCEMENT_SCHEMA, { ...valid, publishMode: "schedule" });
    assert.ok(!schedule.ok && schedule.fieldErrors?.publishedAt);
    const audience = parseInput(ANNOUNCEMENT_SCHEMA, { ...valid, audiences: [] });
    assert.ok(!audience.ok && audience.fieldErrors?.audiences);
    const unknown = parseInput(ANNOUNCEMENT_SCHEMA, { ...valid, audiences: ["Phụ huynh"] });
    assert.ok(!unknown.ok && unknown.fieldErrors?.["audiences.0"]);
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
