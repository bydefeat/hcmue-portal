import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import {
  announcementRows,
  fillWeeks,
  lecturerAnnouncements,
  lecturerClass,
  lecturerSyllabus,
  readSyllabus,
  studentAnnouncements,
  studentClass,
  studentClasses,
  studentSyllabus,
} from "@/modules/teaching/teaching.lib";
import { classAnnouncements } from "@/modules/teaching/teaching.schema";
import type { ClassAnnouncement, StudentClassAnnouncement, StudentClassDetail, Syllabus } from "@/modules/teaching/teaching.type";
import { getCurrentStudent } from "@/modules/users/users.query";
import { lecturers, students } from "@/modules/users/users.schema";

// Quyền đọc dữ liệu lớp kiểm ở đây chứ không ở layout: layout không chạy lại khi điều hướng mềm hay gọi RSC thẳng tới page con.
// Người gọi là giảng viên dạy lớp (thấy cả bài hẹn giờ, đề cương nháp) hoặc sinh viên đang học lớp (chỉ bài đã đăng,
// đề cương đã công bố); còn lại (giảng viên khác, sinh viên ngoài lớp, cán bộ) nhận null.
const viewerIds = cache(async () => {
  const { user, roles } = await requireSession();
  const [lecturer, student] = await Promise.all([
    roles.includes("lecturer") ? db.select({ id: lecturers.id }).from(lecturers).where(eq(lecturers.userId, user.id)) : [],
    roles.includes("student") ? db.select({ id: students.id }).from(students).where(eq(students.userId, user.id)) : [],
  ]);
  return { lecturerId: lecturer[0]?.id ?? null, studentId: student[0]?.id ?? null };
});

// Đầu mỗi page trong /lecturer/classes/[classId]: không phải giảng viên dạy lớp thì 404, trước khi đọc dữ liệu khác của lớp.
export async function requireTaughtClass(classSectionId: string) {
  const { lecturerId } = await viewerIds();
  const section = lecturerId ? await lecturerClass(lecturerId, classSectionId) : null;
  if (!section) notFound();
  return section;
}

export async function getSyllabus(classSectionId: string, fallback: { courseCode: string; courseName: string }): Promise<Syllabus | null> {
  const { lecturerId, studentId } = await viewerIds();
  if (!isUuid(classSectionId)) return null;
  const own = lecturerId ? await lecturerSyllabus(lecturerId, classSectionId) : null;
  if (own) {
    return (
      own.syllabus ?? {
        classSectionId,
        courseCode: fallback.courseCode,
        courseName: fallback.courseName,
        status: "draft",
        publishedAt: null,
        updatedAt: new Date().toISOString(),
        description: "",
        outcomes: [],
        weeks: fillWeeks([]),
        assessments: [],
        references: [],
      }
    );
  }
  return studentId ? studentSyllabus(studentId, classSectionId) : null;
}

export async function getClassAnnouncements(classSectionId: string): Promise<ClassAnnouncement[] | null> {
  const { lecturerId, studentId } = await viewerIds();
  if (!isUuid(classSectionId)) return null;
  const own = lecturerId ? await lecturerAnnouncements(lecturerId, classSectionId) : null;
  if (own) return own;
  if (studentId && (await studentClass(studentId, classSectionId))) return studentAnnouncements(studentId, classSectionId);
  return null;
}

export async function getClassAnnouncement(id: string): Promise<ClassAnnouncement | null> {
  const { lecturerId, studentId } = await viewerIds();
  if (!isUuid(id)) return null;
  const [announcement] = await announcementRows(eq(classAnnouncements.id, id));
  if (!announcement) return null;
  if (lecturerId && (await lecturerClass(lecturerId, announcement.classSectionId))) return announcement;
  if (studentId) {
    const visible = await studentAnnouncements(studentId, announcement.classSectionId);
    return visible.find((entry) => entry.id === id) ?? null;
  }
  return null;
}

// Thông báo đã tới giờ đăng của các lớp sinh viên đang học, kèm đã đọc hay chưa.
export async function getMyClassAnnouncements(): Promise<StudentClassAnnouncement[]> {
  const student = await getCurrentStudent();
  return studentAnnouncements(student.id);
}

// Lớp học phần học kỳ hiện tại của sinh viên đang đăng nhập, kèm số thông báo chưa đọc.
export async function getMyClasses() {
  const student = await getCurrentStudent();
  return studentClasses(student.id);
}

// Trang lớp của sinh viên: chỉ sinh viên đang học lớp mới xem được; đề cương chỉ hiện khi giảng viên đã công bố.
export async function getMyClass(classSectionId: string): Promise<StudentClassDetail | null> {
  const student = await getCurrentStudent();
  const section = await studentClass(student.id, classSectionId);
  if (!section) return null;
  const [announcements, syllabus] = await Promise.all([studentAnnouncements(student.id, section.id), readSyllabus(section.id)]);
  return { ...section, announcements, syllabus: syllabus?.status === "published" ? syllabus : null };
}
