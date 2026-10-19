import type { Metadata } from "next";
import { CourseTable } from "@/modules/curriculum/components/course-table";
import { getCourses, getFacultyNames } from "@/modules/curriculum/curriculum.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Học phần" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("curriculum.manage");
  const [{ q }, courses, faculties] = await Promise.all([searchParams, getCourses(), getFacultyNames()]);
  return (
    <CourseTable
      header={{
        title: "Danh mục học phần",
        description: "Mã, số tín chỉ và học phần tiên quyết dùng chung cho mọi chương trình. Hệ thống chặn đăng ký khi sinh viên chưa đạt tiên quyết.",
      }}
      courses={courses}
      faculties={faculties}
      initialQuery={q}
    />
  );
}
