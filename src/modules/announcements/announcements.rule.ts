import { z } from "zod";
import { normalizeSearch } from "@/shared/libs/search.lib";
import type { AnnouncementAudience, AnnouncementFormValues, AnnouncementStatus, AnnouncementViewer } from "@/modules/announcements/announcements.type";

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return (
    normalizeSearch(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "thong-bao"
  );
}

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

export const EVERYONE: AnnouncementAudience = { students: true, lecturers: true, cohorts: [], facultyIds: [], majorIds: [] };

export const ANNOUNCEMENT_AUDIENCE_SCHEMA = z
  .object({
    students: z.boolean().default(false),
    lecturers: z.boolean().default(false),
    cohorts: z.array(z.int().min(1).max(99)).max(20).default([]),
    facultyIds: z.array(z.uuid("Khoa không hợp lệ")).max(50).default([]),
    majorIds: z.array(z.uuid("Ngành không hợp lệ")).max(100).default([]),
  })
  .refine((audience) => audience.students || audience.lecturers, { path: ["students"], message: "Chọn gửi tới sinh viên, giảng viên hoặc cả hai" })
  .transform((audience) => ({
    ...audience,
    cohorts: [...new Set(audience.cohorts)].toSorted((a, b) => a - b),
    facultyIds: [...new Set(audience.facultyIds)],
    majorIds: audience.students ? [...new Set(audience.majorIds)] : [],
  }));

export const ANNOUNCEMENT_SCHEMA = z
  .object({
    title: z.string().trim().min(1, "Chưa nhập tiêu đề").max(160, "Tối đa 160 ký tự"),
    category: z.enum(["registration", "exam", "tuition", "academic", "event"], "Chưa chọn loại"),
    audience: ANNOUNCEMENT_AUDIENCE_SCHEMA,
    summary: z.string().trim().max(200, "Tối đa 200 ký tự").default(""),
    content: z.string().trim().min(1, "Chưa nhập nội dung").max(2000, "Tối đa 2000 ký tự"),
    deadline: z.iso.datetime({ offset: true, message: "Hạn chót không hợp lệ" }).nullish().transform((value) => value ?? null),
    isPinned: z.boolean().default(false),
    publishMode: z.enum(["now", "schedule", "draft"], "Chưa chọn thời điểm đăng"),
    publishedAt: z.iso.datetime({ offset: true, message: "Thời điểm đăng không hợp lệ" }).nullish().transform((value) => value ?? null),
    notifyPortal: z.boolean().default(false),
    notifyEmail: z.boolean().default(false),
  })
  .refine((value) => value.publishMode !== "schedule" || value.publishedAt !== null, { path: ["publishedAt"], message: "Chưa chọn thời điểm đăng" });

export type AnnouncementInput = z.input<typeof ANNOUNCEMENT_SCHEMA>;

export function announcementVisibleTo(audience: AnnouncementAudience, viewer: AnnouncementViewer) {
  const facultyOk = audience.facultyIds.length === 0 || audience.facultyIds.includes(viewer.facultyId);
  if (viewer.kind === "lecturer") return audience.lecturers && facultyOk;
  return (
    audience.students &&
    facultyOk &&
    (audience.cohorts.length === 0 || audience.cohorts.includes(viewer.cohort)) &&
    (audience.majorIds.length === 0 || audience.majorIds.includes(viewer.majorId))
  );
}

export function isPublicAudience(audience: AnnouncementAudience) {
  return audience.students;
}

export function audienceLabel(audience: AnnouncementAudience, names: { faculties: Map<string, string>; majors: Map<string, string> }) {
  const faculty = audience.facultyIds.map((id) => names.faculties.get(id) ?? "Khoa không còn").join(", ");
  if (audience.students && audience.lecturers && audience.cohorts.length === 0 && audience.majorIds.length === 0) {
    return faculty ? `Sinh viên và giảng viên · ${faculty}` : "Toàn trường";
  }
  const parts: string[] = [];
  if (audience.students) {
    const cohorts = audience.cohorts.length > 0 ? ` khóa ${audience.cohorts.join(", ")}` : "";
    const majors = audience.majorIds.length > 0 ? ` ngành ${audience.majorIds.map((id) => names.majors.get(id) ?? "không còn").join(", ")}` : "";
    parts.push(`Sinh viên${cohorts}${majors}`);
  }
  if (audience.lecturers) parts.push("Giảng viên");
  return faculty ? `${parts.join(", ")} · ${faculty}` : parts.join(", ");
}

export function draftBlockedReason(liveStatus: AnnouncementStatus | null, nextStatus: AnnouncementStatus) {
  if (nextStatus === "draft" && (liveStatus === "published" || liveStatus === "archived")) {
    return "Thông báo đã đăng không lưu nháp lại được. Sửa và đăng tiếp, hoặc gỡ thông báo.";
  }
  return null;
}
