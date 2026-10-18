import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { LecturerTable } from "@/modules/users/components/lecturer-table";
import { getLecturers } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Giảng viên" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, lecturers] = await Promise.all([searchParams, getLecturers()]);
  const advisorCount = lecturers.filter((lecturer) => lecturer.isAdvisor).length;

  return (
    <>
      <PageHeader
        title="Giảng viên"
        description={`${lecturers.length} giảng viên, trong đó ${advisorCount} người kiêm cố vấn học tập. Vai trò quyết định mục nào hiện trên cổng giảng viên.`}
      />
      <LecturerTable key={q ?? ""} lecturers={lecturers} initialQuery={q ?? ""} />
    </>
  );
}
