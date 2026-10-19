import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors, programs } from "@/modules/curriculum/curriculum.schema";
import { buildTranscript, computeStanding, type TranscriptTermInput } from "@/modules/grades/grades.rule";
import { courseResults } from "@/modules/grades/grades.schema";
import type { LetterGrade } from "@/modules/grades/grades.type";
import { GRADUATING_COHORT, GRADUATION_MAX_REQUIRED_CREDITS } from "@/modules/graduation/graduation.constant";
import { evaluateGraduation } from "@/modules/graduation/graduation.rule";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import type { GraduationCandidate } from "@/modules/graduation/graduation.type";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Kết quả tích lũy (CPA, tín chỉ, nợ) tính từ course_results theo cùng công thức với bảng điểm sinh viên.
async function standingsOf(studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, ReturnType<typeof computeStanding>>();
  const rows = await db
    .select({
      studentId: courseResults.studentId,
      termId: courseResults.termId,
      termName: terms.name,
      isCurrent: terms.isCurrent,
      courseCode: courses.code,
      courseName: courses.name,
      credits: courses.credits,
      score10: courseResults.score10,
      letter: courseResults.letter,
      point4: courseResults.point4,
    })
    .from(courseResults)
    .innerJoin(courses, eq(courses.id, courseResults.courseId))
    .innerJoin(terms, eq(terms.id, courseResults.termId))
    .where(inArray(courseResults.studentId, studentIds))
    .orderBy(asc(terms.startDate), asc(courseResults.recordedAt), asc(courses.code));
  const byStudent = new Map<string, Map<string, TranscriptTermInput>>();
  for (const { studentId, termId, termName, isCurrent, ...course } of rows) {
    const byTerm = byStudent.get(studentId) ?? new Map<string, TranscriptTermInput>();
    byStudent.set(studentId, byTerm);
    const term = byTerm.get(termId) ?? { termId, termName, isInProgress: isCurrent, courses: [] };
    byTerm.set(termId, term);
    term.courses.push({ ...course, letter: course.letter as LetterGrade | null });
  }
  return new Map(studentIds.map((id) => [id, computeStanding(id, buildTranscript([...(byStudent.get(id)?.values() ?? [])]))]));
}

// Sinh viên khóa đang xét (đang học hoặc đã tốt nghiệp đợt trước) trong phạm vi của người xem, đã đánh giá từng điều kiện.
export async function loadGraduationCandidates(viewer: Pick<Viewer, "faculty">): Promise<GraduationCandidate[]> {
  const cohort = (
    await db
      .select({
        id: students.id,
        code: students.code,
        fullName: students.fullName,
        status: students.status,
        className: administrativeClasses.code,
        majorId: majors.id,
        majorName: majors.name,
        faculty: faculties.name,
      })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(and(eq(administrativeClasses.cohort, GRADUATING_COHORT), inArray(students.status, ["studying", "graduated"])))
      .orderBy(asc(students.code))
  ).filter((student) => inScope(viewer, student.faculty));
  const ids = cohort.map((student) => student.id);
  const [standings, records, activePrograms] = await Promise.all([
    standingsOf(ids),
    ids.length > 0 ? db.select().from(graduationRecords).where(inArray(graduationRecords.studentId, ids)) : Promise.resolve([]),
    db.select({ majorId: programs.majorId, totalCredits: programs.totalCredits }).from(programs).where(eq(programs.status, "active")),
  ]);
  const recordOf = new Map(records.map((record) => [record.studentId, record]));
  return cohort.map((student) => {
    const standing = standings.get(student.id)!;
    const record = recordOf.get(student.id);
    const program = activePrograms.find((entry) => entry.majorId === student.majorId);
    return evaluateGraduation({
      studentId: student.id,
      languageCertificate: record?.languageCertificate ?? null,
      itCertificate: record?.itCertificate ?? null,
      tuitionCleared: record?.tuitionCleared ?? false,
      disciplineFree: record?.disciplineFree ?? true,
      code: formatStudentCode(student.code),
      fullName: student.fullName,
      className: student.className,
      faculty: student.faculty,
      majorName: student.majorName,
      earnedCredits: standing.earnedCredits,
      requiredCredits: Math.min(program?.totalCredits ?? GRADUATION_MAX_REQUIRED_CREDITS, GRADUATION_MAX_REQUIRED_CREDITS),
      cpa4: standing.cpa4,
      failedCredits: standing.failedCredits,
      alreadyGraduated: student.status === "graduated" || record?.status === "graduated",
      isApproved: record?.status === "approved",
    });
  });
}

export async function getGraduationCandidates() {
  const viewer = await requirePermission("graduation.manage");
  return loadGraduationCandidates(viewer);
}
