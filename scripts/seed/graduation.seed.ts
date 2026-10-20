import type { Transaction } from "@/shared/libs/db.lib";
import { mockDate } from "@/shared/libs/mock.lib";
import { GRADUATION_ROUND, mockGraduationExtras } from "@/modules/graduation/graduation.mock";
import { graduationRecords, graduationRounds } from "@/modules/graduation/graduation.schema";
import { STUDENTS } from "@/modules/users/users.mock";
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
  return { records: rows.length };
}
