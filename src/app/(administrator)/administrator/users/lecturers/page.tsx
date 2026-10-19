import type { Metadata } from "next";
import { LecturerTable } from "@/modules/users/components/lecturer-table";
import { getAccountStates, getLecturers } from "@/modules/users/users.query";
import { NO_ACCOUNT } from "@/modules/users/users.constant";
import { getFacultyNames } from "@/modules/curriculum/curriculum.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Giảng viên" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("lecturers.manage");
  const [{ q }, lecturers, faculties, accounts] = await Promise.all([searchParams, getLecturers(), getFacultyNames(), getAccountStates("lecturer")]);
  const advisorCount = lecturers.filter((lecturer) => lecturer.isAdvisor).length;

  return (
    <LecturerTable
      key={q ?? ""}
      header={{
        title: "Giảng viên",
        description: `${lecturers.length} giảng viên, trong đó ${advisorCount} người kiêm cố vấn học tập. Vai trò quyết định mục nào hiện trên cổng giảng viên.`,
      }}
      lecturers={lecturers.map((lecturer) => ({ ...lecturer, account: accounts[lecturer.id] ?? NO_ACCOUNT }))}
      faculties={faculties}
      initialQuery={q ?? ""}
    />
  );
}
