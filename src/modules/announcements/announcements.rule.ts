import { z } from "zod";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { ANNOUNCEMENT_AUDIENCES } from "@/modules/announcements/announcements.constant";
import type { AnnouncementFormValues, AnnouncementStatus } from "@/modules/announcements/announcements.type";

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Đường dẫn thông báo từ tiêu đề: bỏ dấu, chữ thường, nối bằng gạch ngang (khớp CHECK announcements_slug_format).
export function slugify(value: string) {
  return (
    normalizeSearch(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "thong-bao"
  );
}

// Trùng đường dẫn thì thêm hậu tố -2, -3... theo số nhỏ nhất còn trống.
export function uniqueSlug(base: string, taken: string[]) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function statusOfPublishMode(mode: AnnouncementFormValues["publishMode"]): AnnouncementStatus {
  return mode === "draft" ? "draft" : mode === "schedule" ? "scheduled" : "published";
}

const AUDIENCES = ANNOUNCEMENT_AUDIENCES as [string, ...string[]];

// Dùng chung cho form và server action; thời điểm hẹn giờ phải sau hiện tại được kiểm thêm ở action.
export const ANNOUNCEMENT_SCHEMA = z
  .object({
    title: z.string().trim().min(1, "Chưa nhập tiêu đề").max(160, "Tối đa 160 ký tự"),
    category: z.enum(["registration", "exam", "tuition", "academic", "event"], "Chưa chọn loại"),
    audiences: z
      .array(z.enum(AUDIENCES, "Đối tượng không có trong danh sách"))
      .min(1, "Chọn ít nhất một đối tượng")
      .transform((values) => [...new Set(values)]),
    summary: z.string().trim().max(200, "Tối đa 200 ký tự").default(""),
    content: z.string().trim().min(1, "Chưa nhập nội dung").max(2000, "Tối đa 2000 ký tự"),
    deadline: z.iso.datetime({ offset: true, message: "Hạn chót không hợp lệ" }).nullish().transform((value) => value ?? null),
    isPinned: z.boolean().default(false),
    publishMode: z.enum(["now", "schedule", "draft"], "Chưa chọn thời điểm đăng"),
    publishedAt: z.iso.datetime({ offset: true, message: "Thời điểm đăng không hợp lệ" }).nullish().transform((value) => value ?? null),
  })
  .refine((value) => value.publishMode !== "schedule" || value.publishedAt !== null, { path: ["publishedAt"], message: "Chưa chọn thời điểm đăng" });

export type AnnouncementInput = z.input<typeof ANNOUNCEMENT_SCHEMA>;
