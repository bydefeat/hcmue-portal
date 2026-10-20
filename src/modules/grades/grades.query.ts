import "server-only";
import { cache } from "react";
import { forbidden } from "next/navigation";
import { and, asc, count, desc, eq, exists, inArray, lte, ne, or } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { schoolToday } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireRole, requireSession } from "@/modules/authentication/authentication.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { examSessions } from "@/modules/exams/exams.schema";
import { DEFAULT_COMPONENTS } from "@/modules/grades/grades.constant";
import { cumulativeResults, currentWarnings, loadTranscripts } from "@/modules/grades/grades.lib";
import {
  computeStanding,
  consecutiveWarnings,
  expulsionReasons,
  gradeEntryDeadline,
  isWarningTerm,
  sheetState,
  sheetSummary,
  standingRulesOf,
  summarizeStandings,
  toStanding,
} from "@/modules/grades/grades.rule";
import { academicWarnings, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type {
  AcademicWarning,
  CurrentWarning,
  ExpulsionProposal,
  FacultyStandingSummary,
  GradeComponent,
  GradeSheet,
  GradeSheetState,
  GradeSheetSummary,
  GradingRules,
  StudentStanding,
  TranscriptTerm,
} from "@/modules/grades/grades.type";
import { graduationRounds } from "@/modules/graduation/graduation.schema";
import { getRegulation } from "@/modules/settings/settings.query";
import { syllabi, syllabusAssessments } from "@/modules/teaching/teaching.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";

const ownStudentId = cache(async (userId: string) => {
  const [row] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId));
  return row?.id ?? null;
});

// Giảng viên chỉ đọc kết quả của sinh viên lớp mình cố vấn hoặc đang, đã học lớp học phần mình dạy.
const lecturerReach = cache(async (userId: string, key: string) => {
  const ids = key.split(",");
  const [lecturer] = await db.select({ id: lecturers.id }).from(lecturers).where(eq(lecturers.userId, userId));
  if (!lecturer) return false;
  const reachable = await db
    .select({ id: students.id })
    .from(students)
    .leftJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(
      and(
        inArray(students.id, ids),
        or(
          eq(administrativeClasses.advisorId, lecturer.id),
          exists(
            db
              .select({ id: enrollments.id })
              .from(enrollments)
              .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
              .where(and(eq(enrollments.studentId, students.id), eq(classSections.lecturerId, lecturer.id))),
          ),
        ),
      ),
    );
  return reachable.length === ids.length;
});

// Sinh viên chỉ đọc kết quả của chính mình; giảng viên chỉ sinh viên mình dạy hoặc cố vấn; cán bộ đọc theo quyền của trang từng cổng.
async function requireResultAccess(studentIds: string[]) {
  const session = await requireSession();
  if (session.roles.includes("admin")) return;
  const ids = [...new Set(studentIds.filter(isUuid))].toSorted();
  if (ids.length === 0) return;
  if (session.roles.includes("lecturer") && (await lecturerReach(session.user.id, ids.join(",")))) return;
  const own = session.roles.includes("student") ? await ownStudentId(session.user.id) : null;
  if (ids.some((id) => id !== own)) forbidden();
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

// Bảng điểm của một sinh viên, cache theo request: trang sinh viên gọi cả bảng điểm lẫn xếp loại mà chỉ đọc DB một lần.
const transcriptOf = cache(async (studentId: string): Promise<TranscriptTerm[]> => {
  const transcripts = await loadTranscripts(db, [studentId], { currentTermId: await currentTermId(), withOngoing: true });
  return transcripts.get(studentId) ?? [];
});

export async function getTranscript(studentId: string): Promise<TranscriptTerm[]> {
  await requireResultAccess([studentId]);
  if (!isUuid(studentId)) return [];
  return transcriptOf(studentId);
}

export async function getStudentStandings(studentIds: string[]): Promise<StudentStanding[]> {
  await requireResultAccess(studentIds);
  const regulation = await getRegulation();
  const rules = standingRulesOf(regulation);
  if (studentIds.length === 1 && isUuid(studentIds[0])) return [computeStanding(studentIds[0], await transcriptOf(studentIds[0]), rules)];
  const transcripts = await loadTranscripts(db, studentIds, { currentTermId: await currentTermId() });
  return studentIds.map((id) => computeStanding(id, transcripts.get(id) ?? [], rules));
}

// Cảnh báo chính thức đang có hiệu lực (đã gửi thông báo, học kỳ có cảnh báo đã ban hành gần nhất) của các sinh viên.
export async function getCurrentWarnings(studentIds: string[]): Promise<Record<string, CurrentWarning>> {
  await requireResultAccess(studentIds);
  return Object.fromEntries(await currentWarnings(db, studentIds));
}

// Khóa đang xét tốt nghiệp theo đợt xét đang mở (cấu hình ở trang Xét tốt nghiệp).
const graduatingCohorts = cache(async () => {
  const [round] = await db.select({ cohorts: graduationRounds.cohorts }).from(graduationRounds).where(eq(graduationRounds.isOpen, true)).limit(1);
  return round?.cohorts ?? [];
});

// Xếp loại học lực theo khoa đến hết học kỳ đã kết thúc gần nhất, tổng hợp trong SQL; không gồm khóa đang xét tốt nghiệp.
export async function getStandingSummary(): Promise<FacultyStandingSummary[]> {
  await requireRole("admin");
  const [regulation, cohorts] = await Promise.all([getRegulation(), graduatingCohorts()]);
  const [rows, results, warnings] = await Promise.all([
    db
      .select({ id: students.id, faculty: faculties.name, cohort: administrativeClasses.cohort })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(eq(students.status, "studying"))
      .orderBy(asc(students.code)),
    cumulativeResults(db, { excludeCurrent: true }),
    currentWarnings(db),
  ]);
  return summarizeStandings(
    rows
      .filter((row) => !cohorts.includes(row.cohort))
      .map((row) => {
        const result = results.get(row.id);
        return {
          faculty: row.faculty,
          standing: { cpa4: result?.cpa4 ?? null, standing: result ? toStanding(result.cpa4, regulation.grading.standing) : null },
          warned: warnings.has(row.id),
        };
      }),
  );
}

// Cảnh báo học vụ của một học kỳ (bỏ trống là học kỳ xét gần nhất), mức nặng và CPA thấp lên đầu.
// Giảng viên (cố vấn) chỉ đọc cảnh báo của sinh viên mình phụ trách; cán bộ đọc toàn trường rồi trang lọc theo khoa.
export async function getAcademicWarnings(studentIds?: string[], termId?: string): Promise<AcademicWarning[]> {
  const session = await requireStaff();
  if (studentIds === undefined && !session.roles.includes("admin")) forbidden();
  if (studentIds) await requireResultAccess(studentIds);
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

// Đề xuất xét buộc thôi học sau một học kỳ: sinh viên có cảnh báo ở học kỳ đó và bị cảnh báo đủ số học kỳ chính liên tiếp theo quy chế,
// hoặc ở mức 3. Chỉ là danh sách cho Phòng Đào tạo; quyết định buộc thôi học lập ở mục Quyết định sinh viên.
export async function getExpulsionProposals(termId: string): Promise<ExpulsionProposal[]> {
  await requireRole("admin");
  if (!isUuid(termId)) return [];
  const [[term], regulation] = await Promise.all([db.select({ startDate: terms.startDate }).from(terms).where(eq(terms.id, termId)), getRegulation()]);
  if (!term) return [];
  const [mainTerms, current] = await Promise.all([
    db
      .select({ id: terms.id })
      .from(terms)
      .where(and(ne(terms.semester, 3), lte(terms.startDate, term.startDate)))
      .orderBy(asc(terms.startDate)),
    db
      .select({
        studentId: students.id,
        studentCode: students.code,
        fullName: students.fullName,
        className: administrativeClasses.code,
        faculty: faculties.name,
        level: academicWarnings.level,
        cpa4: academicWarnings.cpa4,
      })
      .from(academicWarnings)
      .innerJoin(students, eq(students.id, academicWarnings.studentId))
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(and(eq(academicWarnings.termId, termId), eq(students.status, "studying"))),
  ]);
  if (current.length === 0) return [];
  const history = await db
    .select({ studentId: academicWarnings.studentId, termId: academicWarnings.termId })
    .from(academicWarnings)
    .where(inArray(academicWarnings.studentId, current.map((row) => row.studentId)));
  const warnedTerms = new Map<string, Set<string>>();
  for (const row of history) warnedTerms.set(row.studentId, (warnedTerms.get(row.studentId) ?? new Set()).add(row.termId));
  const termIds = mainTerms.map((row) => row.id);
  return current
    .map((row) => {
      const consecutive = consecutiveWarnings(termIds, warnedTerms.get(row.studentId) ?? new Set());
      return { ...row, studentCode: formatStudentCode(row.studentCode), level: row.level as 1 | 2 | 3, consecutiveWarnings: consecutive, reasons: expulsionReasons({ consecutive, level: row.level }, regulation.warning) };
    })
    .filter((row) => row.reasons.length > 0)
    .toSorted((a, b) => b.consecutiveWarnings - a.consecutiveWarnings || b.level - a.level || a.cpa4 - b.cpa4);
}

// Bảng điểm lớp kèm trạng thái (theo hạn nhập và số ngày nhắc của quy chế) và quy đổi điểm của bản quy chế đang áp dụng,
// để trang nhập điểm, duyệt điểm tính tổng và điểm chữ đúng như lúc công bố.
export type GradeSheetView = GradeSheet & { state: GradeSheetState; grading: GradingRules };

// Bảng điểm của nhiều lớp trong vài câu lệnh. Lớp chưa có bảng điểm thì trả bảng nháp mặc định, hạn nhập tính theo quy chế
// (ngày thi cuối kỳ hoặc ngày kết thúc học kỳ cộng số ngày nhập điểm); lưu lần đầu mới tạo dòng với đúng hạn đó.
async function sheetViews(sectionIds: string[]): Promise<GradeSheetView[]> {
  const ids = [...new Set(sectionIds.filter(isUuid))];
  if (ids.length === 0) return [];
  const [regulation, sections, sheets, roster, finals] = await Promise.all([
    getRegulation(),
    db
      .select({ id: classSections.id, termEnd: terms.endDate, isConditional: courses.isConditional })
      .from(classSections)
      .innerJoin(terms, eq(terms.id, classSections.termId))
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .where(inArray(classSections.id, ids)),
    db.select().from(gradeSheets).where(inArray(gradeSheets.classSectionId, ids)),
    db
      .select({ id: enrollments.id, studentId: enrollments.studentId, classSectionId: enrollments.classSectionId })
      .from(enrollments)
      .where(and(inArray(enrollments.classSectionId, ids), eq(enrollments.status, "enrolled"))),
    db
      .select({ classSectionId: examSessions.classSectionId, date: examSessions.date })
      .from(examSessions)
      .where(and(inArray(examSessions.classSectionId, ids), eq(examSessions.kind, "final"))),
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
  const finalOf = new Map(finals.map((row) => [row.classSectionId, row.date]));
  const grading = { scale: regulation.grading.scale, roundingStep: regulation.grading.roundingStep };

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
        : gradeEntryDeadline({ finalExamDate: finalOf.get(id) ?? null, termEnd: sectionById.get(id)!.termEnd }, regulation.workflow.gradeEntryDays);
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
        state: sheetState(status, deadline, regulation.workflow.gradeDueSoonDays),
        grading: sectionById.get(id)!.isConditional ? { ...grading, isConditional: true } : grading,
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
  const today = schoolToday();
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
