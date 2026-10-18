import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { ProgramTable } from "@/modules/curriculum/components/program-table";
import { getPrograms } from "@/modules/curriculum/curriculum.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Chương trình đào tạo" };

export default async function Page() {
  await requirePermission("curriculum.manage");
  const programs = await getPrograms();
  return (
    <>
      <PageHeader
        title="Chương trình đào tạo"
        description="Khung chương trình theo ngành và khóa áp dụng. Sinh viên đăng ký học phần dựa trên khung của khóa mình."
      />
      <ProgramTable programs={programs} />
    </>
  );
}
