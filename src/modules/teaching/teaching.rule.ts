import { z } from "zod";
import type { ClassAnnouncementStatus } from "@/modules/teaching/teaching.type";

const text = (max: number) => z.string().trim().max(max, `Tối đa ${max} ký tự`);

// Dùng chung cho form và server action; DB còn chặn bằng syllabus_assessments_weight_range, syllabus_weeks_week_range
// và trigger syllabus_assessments_weights_total_100 (tổng trọng số phải bằng 100 nếu có đánh giá).
export const SYLLABUS_SCHEMA = z
  .object({
    classSectionId: z.uuid(),
    description: text(1500).default(""),
    outcomes: z
      .array(z.object({ text: z.string().trim().min(1, "Chưa nhập nội dung chuẩn đầu ra").max(500, "Tối đa 500 ký tự") }))
      .max(20, "Tối đa 20 chuẩn đầu ra"),
    weeks: z
      .array(
        z.object({
          week: z.int().min(1, "Tuần từ 1 đến 20").max(20, "Tuần từ 1 đến 20"),
          topic: text(300).default(""),
          activities: text(300).default(""),
          readings: text(300).default(""),
        }),
      )
      .max(20, "Tối đa 20 tuần")
      .refine((weeks) => new Set(weeks.map((week) => week.week)).size === weeks.length, "Hai dòng trùng số tuần"),
    assessments: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(60),
          label: z.string().trim().min(1, "Chưa nhập tên hình thức đánh giá").max(100, "Tối đa 100 ký tự"),
          weight: z.int("Nhập trọng số").min(1, "Trọng số ít nhất 1%").max(100, "Trọng số tối đa 100%"),
          method: text(300).default(""),
          outcomes: z.array(z.string().trim()).max(20).default([]),
        }),
      )
      .max(10, "Tối đa 10 hình thức đánh giá")
      .superRefine((items, context) => {
        if (new Set(items.map((item) => item.key)).size !== items.length) context.addIssue({ code: "custom", message: "Hai hình thức đánh giá trùng nhau" });
        const total = assessmentTotal(items);
        if (items.length > 0 && total !== 100) context.addIssue({ code: "custom", message: `Tổng trọng số đang là ${total}%, cần đúng 100%.` });
      }),
    references: z.array(text(300)).max(30, "Tối đa 30 tài liệu"),
  })
  .transform((syllabus) => {
    // Chuẩn đầu ra đánh số lại theo thứ tự; đánh giá trỏ tới chuẩn đã bị xóa thì bỏ mã đó.
    const outcomes = syllabus.outcomes.map((outcome, index) => ({ code: `CLO${index + 1}`, text: outcome.text }));
    const codes = new Set(outcomes.map((outcome) => outcome.code));
    return {
      ...syllabus,
      outcomes,
      weeks: syllabus.weeks.toSorted((a, b) => a.week - b.week),
      assessments: syllabus.assessments.map((item) => ({ ...item, outcomes: [...new Set(item.outcomes)].filter((code) => codes.has(code)) })),
      references: syllabus.references.filter(Boolean),
    };
  });

export type SyllabusInput = z.input<typeof SYLLABUS_SCHEMA>;

export function assessmentTotal(items: { weight: number }[]) {
  return items.reduce((sum, item) => sum + item.weight, 0);
}

export const CLASS_ANNOUNCEMENT_SCHEMA = z
  .object({
    classSectionId: z.uuid(),
    title: z.string().trim().min(1, "Chưa nhập tiêu đề").max(120, "Tối đa 120 ký tự"),
    body: z.string().trim().min(1, "Chưa nhập nội dung").max(2000, "Tối đa 2000 ký tự"),
    isPinned: z.boolean().default(false),
    sendEmail: z.boolean().default(false),
    schedule: z.boolean().default(false),
    publishAt: z.iso.datetime({ offset: true, message: "Thời điểm đăng không hợp lệ" }).nullish(),
  })
  .superRefine((announcement, context) => {
    if (!announcement.schedule) return;
    if (!announcement.publishAt) context.addIssue({ code: "custom", path: ["publishAt"], message: "Chọn thời điểm đăng" });
    else if (new Date(announcement.publishAt).getTime() <= Date.now()) context.addIssue({ code: "custom", path: ["publishAt"], message: "Thời điểm đăng phải sau hiện tại" });
  });

export type ClassAnnouncementInput = z.input<typeof CLASS_ANNOUNCEMENT_SCHEMA>;

// Thông báo hẹn giờ tự thành "đã đăng" khi tới giờ, không cần job chạy nền đổi trạng thái.
export function effectiveAnnouncementStatus(status: ClassAnnouncementStatus, publishAt: Date, now = new Date()): ClassAnnouncementStatus {
  return status === "scheduled" && publishAt.getTime() <= now.getTime() ? "published" : status;
}
