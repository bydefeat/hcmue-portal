import type { Transaction } from "@/shared/libs/db.lib";
import { mockDate } from "@/shared/libs/mock.lib";
import { mockGraduationExtras } from "@/modules/graduation/graduation.mock";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { STUDENTS } from "@/modules/users/users.mock";
import type { SeedContext } from "./context";

const GRADUATING_COHORT = 48;

// Hồ sơ xét tốt nghiệp của khóa 48: chứng chỉ, học phí, kỷ luật. Sinh viên đã tốt nghiệp ở đợt trước thì hồ sơ đã chốt.
export async function seedGraduation(tx: Transaction, _context: SeedContext) {
  const rows = STUDENTS.filter((student) => student.cohort === GRADUATING_COHORT).map((student) => {
    const { languageCertificate, itCertificate, tuitionCleared, disciplineFree } = mockGraduationExtras(student.id);
    const graduated = student.status === "graduated";
    return {
      studentId: student.id,
      languageCertificate,
      itCertificate,
      tuitionCleared,
      disciplineFree,
      status: graduated ? ("graduated" as const) : ("pending" as const),
      decidedAt: graduated ? new Date(mockDate(-180, "09:00")) : null,
    };
  });
  await tx.insert(graduationRecords).values(rows);
  return { records: rows.length };
}
