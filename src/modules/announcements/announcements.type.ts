export type AnnouncementCategory = "registration" | "exam" | "tuition" | "academic" | "event";

export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived";

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

export type AnnouncementViewer = { kind: "student"; cohort: number; majorId: string; facultyId: string } | { kind: "lecturer"; facultyId: string };

export type AnnouncementAudienceOptions = {
  cohorts: number[];
  faculties: { id: string; name: string }[];
  majors: { id: string; name: string; facultyId: string }[];
};
