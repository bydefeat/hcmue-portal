import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getPrograms } from "@/modules/curriculum/curriculum.query";
import { getStudentStandings } from "@/modules/grades/grades.query";
import { GraduationReview } from "@/modules/graduation/components/graduation-review";
import { evaluateGraduation } from "@/modules/graduation/graduation.rule";
import { getGraduationExtras } from "@/modules/graduation/graduation.query";
import { getStudents } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Xét tốt nghiệp" };

const GRADUATING_COHORT = 48;

export default async function Page() {
  const viewer = await requirePermission("graduation.manage");
  const [students, programs] = await Promise.all([getStudents(), getPrograms()]);
  const cohort = students.filter((student) => student.cohort === GRADUATING_COHORT && inScope(viewer, student.faculty) && (student.status === "studying" || student.status === "graduated"));
  const ids = cohort.map((student) => student.id);
  const [standings, extras] = await Promise.all([getStudentStandings(ids), getGraduationExtras(ids)]);
  const candidates = cohort.map((student, index) => {
    const program = programs.find((entry) => entry.majorCode === student.majorCode && entry.status === "active");
    return evaluateGraduation({
      ...extras[index],
      code: student.code,
      fullName: student.fullName,
      className: student.className,
      faculty: student.faculty,
      majorName: student.majorName,
      earnedCredits: standings[index].earnedCredits,
      requiredCredits: Math.min(program?.totalCredits ?? 130, 130),
      cpa4: standings[index].cpa4,
      failedCredits: standings[index].failedCredits,
      alreadyGraduated: student.status === "graduated",
    });
  });
  const count = (status: string) => candidates.filter((candidate) => candidate.status === status).length;

  return (
    <>
      <PageHeader
        title="Xét tốt nghiệp"
        description={`Đợt tháng 12, khóa ${GRADUATING_COHORT}. Hệ thống tự kiểm tra tín chỉ, CPA, nợ học phần, chuẩn đầu ra ngoại ngữ và tin học, học phí, kỷ luật. Mở từng dòng để xem chi tiết.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4">
        <StatTile label="Sinh viên được xét" value={candidates.length} hint={`Khóa ${GRADUATING_COHORT}`} />
        <StatTile label="Đủ điều kiện" value={count("eligible")} hint="Chờ trình hội đồng" />
        <StatTile label="Chưa đủ điều kiện" value={count("missing")} tone={count("missing") > 0 ? "warning" : undefined} hint="Thiếu ít nhất một điều kiện" />
        <StatTile label="Đã tốt nghiệp" value={count("graduated")} hint="Các đợt trước" />
      </div>
      <GraduationReview candidates={candidates} />
    </>
  );
}
