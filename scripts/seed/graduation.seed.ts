import type { Transaction } from "@/shared/libs/db.lib";
import { mockDate, mockId } from "@/shared/libs/mock.lib";
import { mockTranscriptTerms } from "@/modules/grades/grades.mock";
import { buildTranscript, computeStanding, standingRulesOf } from "@/modules/grades/grades.rule";
import { GRADUATION_ROUND, mockGraduationExtras } from "@/modules/graduation/graduation.mock";
import { graduationRecords, graduationRounds } from "@/modules/graduation/graduation.schema";
import { REGULATION_RULES } from "@/modules/settings/settings.mock";
import { STUDENTS } from "@/modules/users/users.mock";
import { studentDecisions } from "@/modules/users/users.schema";
import type { SeedContext } from "./context";

// Đợt xét tốt nghiệp đang mở (khóa 48) và hồ sơ xét tốt nghiệp của các khóa trong đợt: chứng chỉ đã xác nhận. Học phí, kỷ luật suy ra
// từ hóa đơn và quyết định khi xét. Sinh viên đã tốt nghiệp ở đợt trước thì hồ sơ đã chốt.
export async function seedGraduation(tx: Transaction, context: SeedContext) {
  await tx.insert(graduationRounds).values({ ...GRADUATION_ROUND, createdByUserId: context.adminUserId });
  const verifiedAt = new Date(mockDate(-20, "10:00"));
  const rows = STUDENTS.filter((student) => GRADUATION_ROUND.cohorts.includes(student.cohort)).map((student) => {
    const { languageCertificate, languageLevel, itCertificate } = mockGraduationExtras(student.id);
    const graduated = student.status === "graduated";
    return {
      studentId: student.id,
      languageCertificate,
      languageLevel,
      itCertificate,
      certificatesVerifiedAt: verifiedAt,
      certificatesVerifiedByUserId: context.adminUserId,
      status: graduated ? ("graduated" as const) : ("pending" as const),
      decidedAt: graduated ? new Date(mockDate(-180, "09:00")) : null,
    };
  });
  await tx.insert(graduationRecords).values(rows);

  // Một sinh viên khóa đang xét có CPA Xuất sắc bị kỷ luật mức cảnh cáo trong thời gian học: đủ điều kiện nhưng hạng tốt nghiệp bị giảm
  // một mức theo quy chế (minh họa giảm hạng trên trang Xét tốt nghiệp).
  const disciplined = STUDENTS.map((student, index) => ({ student, index })).find(({ student, index }) => {
    if (!GRADUATION_ROUND.cohorts.includes(student.cohort) || student.status !== "studying" || student.majorCode !== "104") return false;
    const standing = computeStanding(student.id, buildTranscript(mockTranscriptTerms(index)), standingRulesOf(REGULATION_RULES));
    return standing.standing === "excellent" && standing.failedCredits === 0;
  });
  if (disciplined) {
    await tx.insert(studentDecisions).values({
      id: mockId(`decision:discipline-warning:${disciplined.index}`),
      number: "1875/QĐ-ĐHSP",
      kind: "discipline",
      studentId: disciplined.student.id,
      title: "Cảnh cáo do sử dụng tài liệu khi thi kết thúc học phần",
      basis: "Biên bản vi phạm quy chế thi học kỳ 1, năm học 2024-2025",
      effectiveDate: "2025-01-20",
      status: "signed",
      signedBy: "PGS.TS. Ngô Đức Thịnh",
      signedAt: new Date("2025-01-20T02:00:00Z"),
    });
  }
  return { records: rows.length };
}
