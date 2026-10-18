import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { DecisionTable } from "@/modules/users/components/decision-table";
import { getDecisions, getStudents } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Quyết định sinh viên" };

export default async function Page() {
  const viewer = await requirePermission("decisions.manage");
  const [decisions, students] = await Promise.all([getDecisions(), getStudents()]);
  const scoped = decisions.filter((decision) => inScope(viewer, decision.faculty));
  const pending = scoped.filter((decision) => decision.status === "pending-signature").length;

  return (
    <>
      <PageHeader
        title="Quyết định sinh viên"
        description={`Bảo lưu, thôi học, chuyển ngành, khen thưởng, kỷ luật và tốt nghiệp. Quy trình: dự thảo, trình ký, đã ký.${pending > 0 ? ` ${pending} quyết định đang chờ ký.` : ""}`}
      />
      <DecisionTable
        decisions={scoped}
        students={students.filter((student) => inScope(viewer, student.faculty)).map(({ id, code, fullName, className, faculty }) => ({ id, code, fullName, className, faculty }))}
        signerName={viewer.name}
      />
    </>
  );
}
