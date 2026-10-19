import type { Metadata } from "next";
import { ProgramTable } from "@/modules/curriculum/components/program-table";
import { getMajors, getPrograms } from "@/modules/curriculum/curriculum.query";
import { getCohorts } from "@/modules/users/users.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Chương trình đào tạo" };

export default async function Page() {
  await requirePermission("curriculum.manage");
  const [programs, majors, cohorts] = await Promise.all([getPrograms(), getMajors(), getCohorts()]);
  return (
    <ProgramTable
      header={{
        title: "Chương trình đào tạo",
        description: "Khung chương trình theo ngành và khóa áp dụng. Sinh viên đăng ký học phần dựa trên khung của khóa mình.",
      }}
      programs={programs}
      majors={majors}
      cohorts={cohorts}
    />
  );
}
