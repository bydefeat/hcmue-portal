export type AnnouncementCategory = "registration" | "exam" | "tuition" | "academic" | "event";

export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived";

export type Announcement = {
  id: string;
  slug: string;
  title: string;
  category: AnnouncementCategory;
  audiences: string[];
  status: AnnouncementStatus;
  isPinned: boolean;
  publishedAt: string | null;
  deadline: string | null;
  author: string;
  summary: string;
  content: string;
  views: number;
};

export type AnnouncementFormValues = {
  title: string;
  category: AnnouncementCategory;
  audiences: string[];
  summary: string;
  content: string;
  deadline?: string;
  isPinned: boolean;
  publishMode: "now" | "schedule" | "draft";
  publishedAt?: string;
};
