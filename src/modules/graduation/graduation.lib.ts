import "server-only";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import type { Viewer } from "@/modules/access/access.type";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { conditionalCoursesOf, electiveGroupsOf, programFor, programsOf, requiredCoursesOf } from "@/modules/curriculum/curriculum.lib";
import { electiveProgress } from "@/modules/curriculum/curriculum.rule";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { loadTranscripts } from "@/modules/grades/grades.lib";
import { computeStanding, latestGrades, standingRulesOf } from "@/modules/grades/grades.rule";
import { evaluateGraduation } from "@/modules/graduation/graduation.rule";
import { graduationRecords, graduationRounds } from "@/modules/graduation/graduation.schema";
import type { GraduationCandidate, GraduationDiscipline, GraduationRound } from "@/modules/graduation/graduation.type";
import { regulationAt } from "@/modules/settings/settings.lib";
import type { CefrLevel } from "@/modules/settings/settings.type";
import { INVOICE_PAID_SQL, INVOICE_TOTAL_SQL } from "@/modules/tuition/tuition.lib";
import { tuitionInvoices } from "@/modules/tuition/tuition.schema";
import { administrativeClasses, studentDecisions, students } from "@/modules/users/users.schema";

type Executor = Transaction | typeof db;

// Đợt xét tốt nghiệp đang mở (chỉ một đợt mở một lúc); chưa mở đợt nào thì không xét.
export async function openGraduationRound(executor: Executor = db): Promise<GraduationRound | null> {
  const [round] = await executor
    .select({ id: graduationRounds.id, name: graduationRounds.name, cohorts: graduationRounds.cohorts, updatedAt: graduationRounds.updatedAt })
    .from(graduationRounds)
    .where(eq(graduationRounds.isOpen, true))
    .orderBy(desc(graduationRounds.createdAt))
    .limit(1);
  return round ? { ...round, updatedAt: round.updatedAt.toISOString() } : null;
}

// Học phí còn nợ của từng sinh viên trên mọi hóa đơn đã chốt (tổng phải nộp trừ đã nộp còn hiệu lực, không âm). Hóa đơn tạm tính
// (học kỳ đang đăng ký, chưa chốt học phí) chưa phải khoản nợ.
async function outstandingTuitionOf(executor: Executor, studentIds: string[]) {
  const rows = await executor
    .select({ studentId: tuitionInvoices.studentId, total: INVOICE_TOTAL_SQL, paid: INVOICE_PAID_SQL })
    .from(tuitionInvoices)
    .where(and(inArray(tuitionInvoices.studentId, studentIds), isNotNull(tuitionInvoices.finalizedAt)));
  const owed = new Map<string, number>();
  for (const row of rows) owed.set(row.studentId, (owed.get(row.studentId) ?? 0) + Math.max(0, row.total - row.paid));
  return owed;
}

// Quyết định kỷ luật đã ký (chưa thu hồi) đã có hiệu lực, mức lấy từ cột discipline_level của quyết định.
async function disciplinesOf(executor: Executor, studentIds: string[]) {
  const rows = await executor
    .select({ studentId: studentDecisions.studentId, title: studentDecisions.title, effectiveDate: studentDecisions.effectiveDate, level: studentDecisions.disciplineLevel })
    .from(studentDecisions)
    .where(
      and(
        inArray(studentDecisions.studentId, studentIds),
        eq(studentDecisions.kind, "discipline"),
        eq(studentDecisions.status, "signed"),
        isNotNull(studentDecisions.appliedAt),
      ),
    )
    .orderBy(asc(studentDecisions.effectiveDate));
  const result = new Map<string, GraduationDiscipline[]>();
  for (const row of rows) {
    result.set(row.studentId, [...(result.get(row.studentId) ?? []), { title: row.title, effectiveDate: row.effectiveDate, level: row.level ?? "warning" }]);
  }
  return result;
}

// Dùng chung cho trang, action và test (không qua kiểm quyền: nơi gọi đã kiểm graduation.manage).
// Sinh viên các khóa của đợt xét đang mở (đang học hoặc đã tốt nghiệp đợt trước) trong phạm vi của người xem, đã đánh giá từng điều kiện:
// tín chỉ và học phần bắt buộc theo khung chương trình của đúng ngành, khóa; CPA, nợ theo lần học cuối; chứng chỉ trong hồ sơ; học phí từ
// hóa đơn; kỷ luật từ quyết định đã ký. Ngưỡng theo bản quy chế đang áp dụng.
export async function loadGraduationCandidates(viewer: Pick<Viewer, "faculty">, executor: Executor = db): Promise<{ round: GraduationRound | null; candidates: GraduationCandidate[] }> {
  const round = await openGraduationRound(executor);
  if (!round) return { round: null, candidates: [] };
  const cohort = (
    await executor
      .select({
        id: students.id,
        code: students.code,
        fullName: students.fullName,
        status: students.status,
        className: administrativeClasses.code,
        cohort: administrativeClasses.cohort,
        majorId: majors.id,
        majorName: majors.name,
        faculty: faculties.name,
      })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(and(inArray(administrativeClasses.cohort, round.cohorts), inArray(students.status, ["studying", "graduated"])))
      .orderBy(asc(students.code))
  ).filter((student) => inScope(viewer, student.faculty));
  const ids = cohort.map((student) => student.id);
  if (ids.length === 0) return { round, candidates: [] };
  const [regulation, [current], programs, records, owed, disciplines] = await Promise.all([
    regulationAt(executor),
    executor.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true)),
    programsOf(executor, cohort),
    executor.select().from(graduationRecords).where(inArray(graduationRecords.studentId, ids)),
    outstandingTuitionOf(executor, ids),
    disciplinesOf(executor, ids),
  ]);
  const programIds = [...programs.values()].map((program) => program.id);
  const [transcripts, required, conditional, electiveGroups] = await Promise.all([
    loadTranscripts(executor, ids, { currentTermId: current?.id ?? null }),
    requiredCoursesOf(executor, programIds),
    conditionalCoursesOf(executor, programIds),
    electiveGroupsOf(executor, programIds),
  ]);
  const recordOf = new Map(records.map((record) => [record.studentId, record]));
  const rules = standingRulesOf(regulation);
  return {
    round,
    candidates: cohort.map((student) => {
      const transcript = transcripts.get(student.id) ?? [];
      const standing = computeStanding(student.id, transcript, rules);
      const grades = latestGrades(transcript);
      const passed = (code: string) => grades[code] !== undefined && grades[code] !== "F";
      const record = recordOf.get(student.id);
      const program = programFor(programs, student);
      const missing = (courses: { code: string; name: string; equivalentCodes: string[] }[] | undefined) =>
        (courses ?? []).filter((course) => !passed(course.code) && !course.equivalentCodes.some(passed)).map(({ code, name }) => ({ code, name }));
      const missingRequired = program ? missing(required.get(program.id)) : [];
      const missingConditional = program ? missing(conditional.get(program.id)) : [];
      const electives = program ? electiveProgress(electiveGroups.get(program.id) ?? [], passed).map(({ name, minCredits, earnedCredits }) => ({ name, minCredits, earnedCredits })) : [];
      return evaluateGraduation(
        {
          studentId: student.id,
          code: formatStudentCode(student.code),
          fullName: student.fullName,
          className: student.className,
          faculty: student.faculty,
          majorName: student.majorName,
          cohort: student.cohort,
          program: program ? { name: program.name, totalCredits: program.totalCredits } : null,
          earnedCredits: standing.earnedCredits,
          cpa4: standing.cpa4,
          failedCredits: standing.failedCredits,
          retakeCredits: standing.retakeCredits,
          missingRequired,
          missingConditional,
          electives,
          languageCertificate: record?.languageCertificate ?? null,
          languageLevel: (record?.languageLevel as CefrLevel | null) ?? null,
          itCertificate: record?.itCertificate ?? null,
          certificatesVerifiedAt: record?.certificatesVerifiedAt?.toISOString() ?? null,
          outstandingTuition: owed.get(student.id) ?? 0,
          disciplines: disciplines.get(student.id) ?? [],
          alreadyGraduated: student.status === "graduated" || record?.status === "graduated",
          isApproved: record?.status === "approved",
        },
        regulation,
      );
    }),
  };
}

