import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { CourseTable } from "@/modules/curriculum/components/course-table";
import { getCourses } from "@/modules/curriculum/curriculum.query";

export const metadata: Metadata = { title: "Học phần" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, courses] = await Promise.all([searchParams, getCourses()]);
  return (
    <>
      <PageHeader
        title="Danh mục học phần"
        description="Mã, số tín chỉ và học phần tiên quyết dùng chung cho mọi chương trình. Hệ thống chặn đăng ký khi sinh viên chưa đạt tiên quyết."
      />
      <CourseTable courses={courses} initialQuery={q} />
    </>
  );
}
