export type SyllabusStatus = "draft" | "published";

export type LearningOutcome = {
  code: string;
  text: string;
};

export type SyllabusWeek = {
  week: number;
  topic: string;
  activities: string;
  readings: string;
};

export type SyllabusAssessment = {
  key: string;
  label: string;
  weight: number;
  method: string;
  outcomes: string[];
};

export type Syllabus = {
  classSectionId: string;
  courseCode: string;
  courseName: string;
  status: SyllabusStatus;
  publishedAt: string | null;
  updatedAt: string;
  description: string;
  outcomes: LearningOutcome[];
  weeks: SyllabusWeek[];
  assessments: SyllabusAssessment[];
  references: string[];
};

export type ClassAnnouncementStatus = "published" | "scheduled";

export type ClassAnnouncement = {
  id: string;
  classSectionId: string;
  title: string;
  body: string;
  isPinned: boolean;
  sendEmail: boolean;
  status: ClassAnnouncementStatus;
  publishAt: string;
  // Lúc đã báo sinh viên; trống là bài hẹn giờ chưa tới giờ hoặc chưa được tác vụ nền báo.
  notifiedAt: string | null;
  author: string;
  readCount: number;
};

export type ClassAnnouncementFormValues = {
  title: string;
  body: string;
  isPinned: boolean;
  sendEmail: boolean;
  schedule: boolean;
  publishAt?: string;
};

export type StudentClassAnnouncement = ClassAnnouncement & {
  classCode: string;
  courseName: string;
  isRead: boolean;
};

export type ClassLecturer = {
  displayName: string;
  email: string;
  office: string;
  officeHours: string;
};

export type StudentClass = {
  id: string;
  code: string;
  courseCode: string;
  courseName: string;
  credits: number;
  termName: string;
  lecturer: ClassLecturer | null;
  unreadCount: number;
  announcementCount: number;
};

export type StudentClassDetail = StudentClass & {
  announcements: StudentClassAnnouncement[];
  syllabus: Syllabus | null;
};
