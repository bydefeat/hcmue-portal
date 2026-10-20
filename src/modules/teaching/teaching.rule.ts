import { z } from "zod";
import type { ClassAnnouncementStatus, SyllabusAssessment } from "@/modules/teaching/teaching.type";

// Loại đánh giá có khóa cố định: đề cương và bảng điểm dùng chung khóa này để đối chiếu cột điểm với hình thức đánh giá.
export const ASSESSMENT_KINDS = [
  { key: "attendance", label: "Chuyên cần" },
  { key: "assignment", label: "Bài tập" },
  { key: "quiz", label: "Kiểm tra thường xuyên" },
  { key: "practice", label: "Thực hành" },
  { key: "presentation", label: "Thuyết trình" },
  { key: "project", label: "Đồ án" },
  { key: "midterm", label: "Giữa kỳ" },
  { key: "final", label: "Cuối kỳ" },
] as const;

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Khóa ổn định của một hình thức đánh giá: tên trùng một loại trong danh mục thì lấy khóa của loại đó ("Giữa kỳ" là midterm,
// "Thi cuối kỳ" là final); còn lại là tên viết không dấu. Bảng điểm cũng đối chiếu qua hàm này nên cột "Giữa kỳ" khớp midterm.
export function assessmentKindKey(label: string) {
  const text = plain(label);
  const kind = ASSESSMENT_KINDS.find((entry) => text === plain(entry.label) || text === `thi-${plain(entry.label)}` || text === `diem-${plain(entry.label)}`);
  return kind?.key ?? (text.slice(0, 40) || "khac");
}

const isKindKey = (key: string) => ASSESSMENT_KINDS.some((kind) => kind.key === key);

// Cột điểm khớp hình thức đánh giá khi cùng khóa, hoặc tên cột thuộc cùng loại đánh giá.
const sameAssessment = (item: { key: string }, component: { key: string; label: string }) => item.key === component.key || item.key === assessmentKindKey(component.label);

// Chỗ lệch giữa đề cương và bảng điểm (cột, trọng số); checkTotal để báo cả tổng trọng số đề cương khác 100%.
export function assessmentMismatches<T extends Pick<SyllabusAssessment, "key" | "label" | "weight">>(assessments: T[], components: { key: string; label: string; weight: number }[], checkTotal = true) {
  const messages: string[] = [];
  const total = assessments.reduce((sum, item) => sum + item.weight, 0);
  if (checkTotal && total !== 100) messages.push(`Tổng trọng số trong đề cương là ${total}%, cần đúng 100%.`);
  for (const component of components) {
    const match = assessments.find((item) => sameAssessment(item, component));
    if (!match) messages.push(`Bảng điểm có cột "${component.label}" (${component.weight}%) nhưng đề cương chưa có.`);
    else if (match.weight !== component.weight) messages.push(`"${component.label}": đề cương ${match.weight}%, bảng điểm ${component.weight}%.`);
  }
  for (const item of assessments) {
    if (!components.some((component) => sameAssessment(item, component))) messages.push(`Đề cương có "${item.label}" nhưng bảng điểm không có cột này.`);
  }
  return messages;
}

// Cách tính điểm có đổi không (khóa, tên, trọng số theo thứ tự): đề cương đã công bố đổi cách tính điểm phải lên phiên bản mới.
const gradingShape = (items: Pick<SyllabusAssessment, "key" | "label" | "weight">[]) => JSON.stringify(items.map(({ key, label, weight }) => [key, label, weight]));

export function gradingChanged(before: Pick<SyllabusAssessment, "key" | "label" | "weight">[], after: Pick<SyllabusAssessment, "key" | "label" | "weight">[]) {
  return gradingShape(before) !== gradingShape(after);
}

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
          // Khóa gửi lên chỉ để chọn loại; server tự suy khóa ổn định (assessmentKindKey) nếu không phải loại trong danh mục.
          key: z.string().trim().max(60).default(""),
          label: z.string().trim().min(1, "Chưa nhập tên hình thức đánh giá").max(100, "Tối đa 100 ký tự"),
          weight: z.int("Nhập trọng số").min(1, "Trọng số ít nhất 1%").max(100, "Trọng số tối đa 100%"),
          method: text(300).default(""),
          outcomes: z.array(z.string().trim()).max(20).default([]),
        }),
      )
      .max(10, "Tối đa 10 hình thức đánh giá")
      .superRefine((items, context) => {
        const keys = items.map((item) => (isKindKey(item.key) ? item.key : assessmentKindKey(item.label)));
        if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Hai hình thức đánh giá cùng loại hoặc trùng tên" });
        const total = assessmentTotal(items);
        if (items.length > 0 && total !== 100) context.addIssue({ code: "custom", message: `Tổng trọng số đang là ${total}%, cần đúng 100%.` });
      }),
    references: z.array(text(300)).max(30, "Tối đa 30 tài liệu"),
    // Đề cương đã công bố mà đổi cách tính điểm: bắt buộc ghi lý do, lưu thành phiên bản mới và báo sinh viên.
    revisionNote: z
      .string()
      .trim()
      .max(300, "Tối đa 300 ký tự")
      .nullish()
      .transform((value) => value || null),
  })
  .transform((syllabus) => ({
    ...syllabus,
    assessments: syllabus.assessments.map((item) => ({ ...item, key: isKindKey(item.key) ? item.key : assessmentKindKey(item.label) })),
  }))
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
