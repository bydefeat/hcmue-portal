export type AnnouncementCategory = "registration" | "exam" | "tuition" | "academic" | "event";

export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived";

// Đối tượng của thông báo chung. Sinh viên lọc theo khóa, ngành, khoa; giảng viên lọc theo khoa. Danh sách rỗng là không lọc.
export type AnnouncementAudience = {
  students: boolean;
  lecturers: boolean;
  cohorts: number[];
  facultyIds: string[];
  majorIds: string[];
};

export type Announcement = {
  id: string;
  slug: string;
  title: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  // Nhãn đối tượng đã ghép tên khoa, ngành ("Sinh viên khóa 50 · Khoa Công nghệ Thông tin").
  audienceLabel: string;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishedAt: string | null;
  deadline: string | null;
  isExpired: boolean;
  author: string;
  summary: string;
  content: string;
  views: number;
  notifyPortal: boolean;
  notifyEmail: boolean;
  notifiedAt: string | null;
};

export type AnnouncementFormValues = {
  title: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  summary: string;
  content: string;
  deadline?: string;
  isPinned: boolean;
  publishMode: "now" | "schedule" | "draft";
  publishedAt?: string;
  notifyPortal: boolean;
  notifyEmail: boolean;
};

// Người xem ở cổng: sinh viên (khóa, ngành, khoa) hoặc giảng viên (khoa).
export type AnnouncementViewer = { kind: "student"; cohort: number; majorId: string; facultyId: string } | { kind: "lecturer"; facultyId: string };

// Danh mục để chọn đối tượng trên form.
export type AnnouncementAudienceOptions = {
  cohorts: number[];
  faculties: { id: string; name: string }[];
  majors: { id: string; name: string; facultyId: string }[];
};
