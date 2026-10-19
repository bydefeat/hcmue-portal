import "server-only";
import { cache } from "react";
import { forbidden } from "next/navigation";
import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireRole, requireSession } from "@/modules/authentication/authentication.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { DEFAULT_COMPONENTS, DEFAULT_DEADLINE_DAYS } from "@/modules/grades/grades.constant";
import { buildTranscript, computeStanding, isWarningTerm, sheetState, sheetSummary, summarizeStandings, type TranscriptTermInput } from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type {
  AcademicWarning,
  FacultyStandingSummary,
  GradeComponent,
  GradeSheet,
  GradeSheetState,
  GradeSheetSummary,
  LetterGrade,
  StudentStanding,
  TranscriptCourse,
  TranscriptTerm,
} from "@/modules/grades/grades.type";
import { syllabi, syllabusAssessments } from "@/modules/teaching/teaching.schema";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Khóa đang xét tốt nghiệp không tính vào báo cáo xếp loại học lực.
const GRADUATING_COHORT = 48;

const ownStudentId = cache(async (userId: string) => {
  const [row] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId));
  return row?.id ?? null;
});

// Sinh viên chỉ đọc được kết quả của chính mình; giảng viên, cán bộ đọc theo trang của từng cổng.
async function requireResultAccess(studentIds: string[]) {
  const session = await requireSession();
  if (session.roles.includes("admin") || session.roles.includes("lecturer")) return;
  const own = await ownStudentId(session.user.id);
  if (studentIds.some((id) => id !== own)) forbidden();
}

async function requireStaff() {
  const session = await requireSession();
  if (!session.roles.includes("admin") && !session.roles.includes("lecturer")) forbidden();
  return session;
}

const currentTermId = cache(async () => {
  const [row] = await db.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true));
  return row?.id ?? null;
});

function transcriptCourse(row: { courseCode: string; courseName: string; credits: number; score10: number | null; letter: string | null; point4: number | null }): TranscriptCourse {
  return { ...row, letter: row.letter as LetterGrade | null };
}

// Bảng điểm theo kỳ: các kỳ có kết quả học phần, cộng kỳ hiện tại (đang học) lấy từ đăng ký, kèm điểm đã công bố nếu có.
async function loadTranscripts(studentIds: string[] | null): Promise<Map<string, TranscriptTerm[]>> {
  const ids = studentIds?.filter(isUuid) ?? null;
  const transcripts = new Map<string, TranscriptTerm[]>();
  if (ids && ids.length === 0) return transcripts;
  const current = await currentTermId();
  const [results, ongoing] = await Promise.all([
    db
      .select({
        studentId: courseResults.studentId,
        termId: courseResults.termId,
        termName: terms.name,
        termStart: terms.startDate,
        enrollmentId: courseResults.enrollmentId,
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
      .where(ids ? inArray(courseResults.studentId, ids) : undefined)
      .orderBy(asc(terms.startDate), asc(courseResults.recordedAt), asc(courses.code)),
    current
      ? db
          .select({
            studentId: enrollments.studentId,
            enrollmentId: enrollments.id,
            termName: terms.name,
            termStart: terms.startDate,
            courseCode: courses.code,
            courseName: courses.name,
            credits: courses.credits,
          })
          .from(enrollments)
          .innerJoin(courses, eq(courses.id, enrollments.courseId))
          .innerJoin(terms, eq(terms.id, enrollments.termId))
          .where(and(eq(enrollments.termId, current), eq(enrollments.status, "enrolled"), ids ? inArray(enrollments.studentId, ids) : undefined))
          .orderBy(asc(enrollments.registeredAt))
      : Promise.resolve([]),
  ]);

  const raw = new Map<string, Map<string, TranscriptTermInput & { start: string }>>();
  const termOf = (studentId: string, termId: string, termName: string, start: string) => {
    const byTerm = raw.get(studentId) ?? new Map<string, TranscriptTermInput & { start: string }>();
    raw.set(studentId, byTerm);
    const term = byTerm.get(termId) ?? { termId, termName, start, isInProgress: termId === current, courses: [] };
    byTerm.set(termId, term);
    return term;
  };
  const resultByEnrollment = new Map(results.filter((row) => row.enrollmentId).map((row) => [row.enrollmentId!, row]));
  for (const row of ongoing) {
    const result = resultByEnrollment.get(row.enrollmentId);
    termOf(row.studentId, current!, row.termName, row.termStart).courses.push(
      transcriptCourse({ ...row, score10: result?.score10 ?? null, letter: result?.letter ?? null, point4: result?.point4 ?? null }),
    );
  }
  for (const row of results) {
    if (row.termId === current && row.enrollmentId) continue;
    termOf(row.studentId, row.termId, row.termName, row.termStart).courses.push(transcriptCourse(row));
  }
  for (const [studentId, byTerm] of raw) {
    const ordered = [...byTerm.values()].toSorted((a, b) => a.start.localeCompare(b.start)).map(({ start: _start, ...term }) => term);
    transcripts.set(studentId, buildTranscript(ordered));
  }
  return transcripts;
}

export async function getTranscript(studentId: string): Promise<TranscriptTerm[]> {
  await requireResultAccess([studentId]);
  if (!isUuid(studentId)) return [];
  return (await loadTranscripts([studentId])).get(studentId) ?? [];
}

export async function getStudentStandings(studentIds: string[]): Promise<StudentStanding[]> {
  await requireResultAccess(studentIds);
  const transcripts = await loadTranscripts(studentIds.length > 200 ? null : studentIds);
  return studentIds.map((id) => computeStanding(id, transcripts.get(id) ?? []));
}

export async function getStandingSummary(): Promise<FacultyStandingSummary[]> {
  await requireRole("admin");
  const [rows, transcripts] = await Promise.all([
    db
      .select({ id: students.id, faculty: faculties.name })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(ne(administrativeClasses.cohort, GRADUATING_COHORT))
      .orderBy(asc(students.code)),
    loadTranscripts(null),
  ]);
  return summarizeStandings(rows.map((row) => ({ faculty: row.faculty, standing: computeStanding(row.id, transcripts.get(row.id) ?? []) })));
}

// Cảnh báo học vụ của một học kỳ (bỏ trống là học kỳ xét gần nhất), mức nặng và CPA thấp lên đầu.
export async function getAcademicWarnings(studentIds?: string[], termId?: string): Promise<AcademicWarning[]> {
  await requireStaff();
  if (termId !== undefined && !isUuid(termId)) return [];
  const ids = studentIds?.filter(isUuid);
  if (ids && ids.length === 0) return [];
  const rows = await db
    .select({
      id: academicWarnings.id,
      studentId: students.id,
      studentCode: students.code,
      fullName: students.fullName,
      className: administrativeClasses.code,
      faculty: faculties.name,
      cohort: administrativeClasses.cohort,
      termId: terms.id,
      termName: terms.name,
      termStart: terms.startDate,
      termGpa4: academicWarnings.termGpa4,
      cpa4: academicWarnings.cpa4,
      failedCredits: academicWarnings.failedCredits,
      level: academicWarnings.level,
      reasons: academicWarnings.reasons,
      status: academicWarnings.status,
      createdAt: academicWarnings.createdAt,
    })
    .from(academicWarnings)
    .innerJoin(terms, eq(terms.id, academicWarnings.termId))
    .innerJoin(students, eq(students.id, academicWarnings.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(and(ids ? inArray(academicWarnings.studentId, ids) : undefined, termId ? eq(academicWarnings.termId, termId) : undefined));
  const latest = rows.reduce<string | null>((best, row) => (best === null || row.termStart > best ? row.termStart : best), null);
  return rows
    .filter((row) => row.termStart === latest)
    .map(({ termId: _termId, termStart: _termStart, ...row }) => ({
      ...row,
      studentCode: formatStudentCode(row.studentCode),
      level: row.level as 1 | 2 | 3,
      createdAt: row.createdAt.toISOString(),
    }))
    .toSorted((a, b) => b.level - a.level || a.cpa4 - b.cpa4);
}

export type GradeSheetView = GradeSheet & { state: GradeSheetState };

// Bảng điểm của nhiều lớp trong 5 câu lệnh. Lớp chưa có bảng điểm thì trả bảng nháp mặc định, lưu lần đầu mới tạo dòng.
async function sheetViews(sectionIds: string[]): Promise<GradeSheetView[]> {
  const ids = [...new Set(sectionIds.filter(isUuid))];
  if (ids.length === 0) return [];
  const [sections, sheets, roster] = await Promise.all([
    db
      .select({ id: classSections.id, termEnd: terms.endDate })
      .from(classSections)
      .innerJoin(terms, eq(terms.id, classSections.termId))
      .where(inArray(classSections.id, ids)),
    db.select().from(gradeSheets).where(inArray(gradeSheets.classSectionId, ids)),
    db
      .select({ id: enrollments.id, studentId: enrollments.studentId, classSectionId: enrollments.classSectionId })
      .from(enrollments)
      .where(and(inArray(enrollments.classSectionId, ids), eq(enrollments.status, "enrolled"))),
  ]);
  const sheetIds = sheets.map((sheet) => sheet.id);
  const [components, scores] =
    sheetIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.select().from(gradeComponents).where(inArray(gradeComponents.gradeSheetId, sheetIds)).orderBy(asc(gradeComponents.position)),
          db
            .select({ componentId: gradeScores.gradeComponentId, enrollmentId: gradeScores.enrollmentId, score: gradeScores.score })
            .from(gradeScores)
            .innerJoin(gradeComponents, eq(gradeComponents.id, gradeScores.gradeComponentId))
            .where(inArray(gradeComponents.gradeSheetId, sheetIds)),
        ]);
  const scoreOf = new Map(scores.map((row) => [`${row.componentId}:${row.enrollmentId}`, row.score]));
  const sheetBySection = new Map(sheets.map((sheet) => [sheet.classSectionId, sheet]));
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  return ids
    .filter((id) => sectionById.has(id))
    .map((id) => {
      const sheet = sheetBySection.get(id);
      const sheetComponents = sheet ? components.filter((component) => component.gradeSheetId === sheet.id) : [];
      const columns = sheet ? sheetComponents.map(({ key, label, weight }) => ({ key, label, weight })) : DEFAULT_COMPONENTS;
      const members = roster.filter((entry) => entry.classSectionId === id);
      const rows: GradeSheet["scores"] = Object.fromEntries(
        members.map((entry) => [
          entry.studentId,
          Object.fromEntries(
            columns.map((column, position) => [column.key, sheet ? (scoreOf.get(`${sheetComponents[position].id}:${entry.id}`) ?? null) : null]),
          ),
        ]),
      );
      const deadline = sheet
        ? sheet.deadline.toISOString()
        : dayjs(sectionById.get(id)!.termEnd).add(DEFAULT_DEADLINE_DAYS, "day").hour(23).minute(59).toISOString();
      const status = sheet?.status ?? "draft";
      return {
        classSectionId: id,
        components: columns,
        status,
        deadline,
        lockedAt: sheet?.lockedAt?.toISOString() ?? null,
        savedAt: sheet?.savedAt?.toISOString() ?? null,
        returnReason: sheet?.returnReason ?? null,
        scores: rows,
        state: sheetState(status, deadline),
      };
    });
}

export async function getGradeSheet(classSectionId: string): Promise<GradeSheetView | null> {
  await requireStaff();
  const [sheet] = await sheetViews([classSectionId]);
  return sheet ?? null;
}

export async function getGradeSheets(classSectionIds: string[]): Promise<GradeSheetView[]> {
  await requireStaff();
  return sheetViews(classSectionIds);
}

export async function getGradeSheetSummaries(classSectionIds: string[]): Promise<GradeSheetSummary[]> {
  await requireStaff();
  return (await sheetViews(classSectionIds)).map(sheetSummary);
}

export type WarningTermOption = { id: string; name: string; warnings: number; canGenerate: boolean };

// Học kỳ có cảnh báo hoặc xét được cảnh báo (học kỳ chính đã kết thúc), mới nhất lên đầu.
export async function getWarningTerms(): Promise<WarningTermOption[]> {
  await requireStaff();
  const today = dayjs().format("YYYY-MM-DD");
  const [rows, counts] = await Promise.all([
    db.select({ id: terms.id, name: terms.name, semester: terms.semester, endDate: terms.endDate }).from(terms).orderBy(desc(terms.startDate)),
    db.select({ termId: academicWarnings.termId, total: count() }).from(academicWarnings).groupBy(academicWarnings.termId),
  ]);
  const countOf = new Map(counts.map((row) => [row.termId, row.total]));
  return rows
    .map((row) => ({ id: row.id, name: row.name, warnings: countOf.get(row.id) ?? 0, canGenerate: isWarningTerm(row, today) }))
    .filter((row) => row.warnings > 0 || row.canGenerate);
}

// Cột điểm theo đề cương đã công bố của lớp, để giảng viên dùng làm cột của bảng điểm. Chưa công bố thì không gợi ý.
export async function getSyllabusComponents(classSectionId: string): Promise<GradeComponent[] | null> {
  await requireStaff();
  if (!isUuid(classSectionId)) return null;
  const rows = await db
    .select({ key: syllabusAssessments.key, label: syllabusAssessments.label, weight: syllabusAssessments.weight })
    .from(syllabusAssessments)
    .innerJoin(syllabi, eq(syllabi.id, syllabusAssessments.syllabusId))
    .where(and(eq(syllabi.classSectionId, classSectionId), eq(syllabi.status, "published")))
    .orderBy(asc(syllabusAssessments.position));
  return rows.length > 0 ? rows : null;
}
