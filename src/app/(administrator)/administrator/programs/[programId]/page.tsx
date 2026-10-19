import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate } from "@/shared/libs/date.lib";
import { ProgramFramework } from "@/modules/curriculum/components/program-framework";
import { PROGRAM_STATUS } from "@/modules/curriculum/curriculum.constant";
import { getProgram } from "@/modules/curriculum/curriculum.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Khung chương trình" };

export default async function Page({ params }: { params: Promise<{ programId: string }> }) {
  await requirePermission("curriculum.manage");
  const { programId } = await params;
  const program = await getProgram(programId);
  if (!program) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/administrator/programs", label: "Chương trình đào tạo" }}
        title={program.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{program.code}</span>
            <span>{program.faculty}</span>
            <span>{program.degree}</span>
            <span className="tabular-nums">
              {program.durationYears} năm · Khóa {program.cohorts.join(", ")}
            </span>
            <span className="tabular-nums">Cập nhật {formatDate(program.updatedAt)}</span>
            <StatusTag status={PROGRAM_STATUS[program.status]} />
          </span>
        }
      />
      <ProgramFramework program={program} />
    </>
  );
}
