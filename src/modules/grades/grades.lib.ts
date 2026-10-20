import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { InputError } from "@/shared/libs/action.lib";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { schoolToday } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { notifyLecturers } from "@/modules/notifications/notifications.lib";
import { regulationAt } from "@/modules/settings/settings.lib";
import {
  academicWarningOf,
  buildTranscript,
  computeStanding,
  isWarningTerm,
  latestWarningTerm,
  planComponentChanges,
  planWarningSync,
  standingRulesOf,
  type ComputedWarning,
  type TranscriptTermInput,
} from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores } from "@/modules/grades/grades.schema";
import type { CurrentWarning, ResultLetter, TranscriptTerm } from "@/modules/grades/grades.type";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Lỗi nghiệp vụ phát hiện trong giao dịch: hủy giao dịch và trả câu báo cho người dùng. Là InputError để action của module khác
// (duyệt đơn chạy handler của module điểm) cũng trả nguyên câu báo qua actionFailure.
export class GradeActionError extends InputError {}

type Executor = Transaction | typeof db;

// Danh sách lớp (sinh viên đang học) dùng cho xuất và nhập tệp bảng điểm, xếp theo tên như danh sách lớp trên trang nhập điểm.
export async function sectionRoster(executor: Executor, classSectionId: string) {
  const rows = await executor
    .select({ studentId: students.id, code: students.code, fullName: students.fullName })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classSectionId, classSectionId), eq(enrollments.status, "enrolled")));
  return rows
    .map((row) => ({ studentId: row.studentId, studentCode: formatStudentCode(row.code), fullName: row.fullName }))
    .toSorted((a, b) => a.fullName.split(" ").at(-1)!.localeCompare(b.fullName.split(" ").at(-1)!, "vi") || a.fullName.localeCompare(b.fullName, "vi"));
}

// Thay bộ cột điểm của một bảng điểm còn sửa được. Cột giữ lại giữ key nên điểm đã nhập còn nguyên; cột bỏ mất luôn điểm
// (nơi gọi phải xác nhận trước). Thứ tự cột có unique không hoãn được nên dời cột giữ ra xa trước rồi mới đặt vị trí cuối.
// Tổng trọng số kiểm ở trigger grade_components_weights_total_100 lúc commit.
export async function replaceGradeComponents(
  tx: Transaction,
  input: { gradeSheetId: string; components: { key: string | null; label: string; weight: number }[]; confirmDropScores: boolean },
) {
  const existing = await tx
    .select({ id: gradeComponents.id, key: gradeComponents.key, label: gradeComponents.label, weight: gradeComponents.weight, position: gradeComponents.position })
    .from(gradeComponents)
    .where(eq(gradeComponents.gradeSheetId, input.gradeSheetId))
    .orderBy(asc(gradeComponents.position));
  const plan = planComponentChanges(existing, input.components);
  if (plan.unknown.length > 0) throw new GradeActionError("Có cột điểm không còn trong bảng điểm, tải lại trang rồi sửa lại.");

  if (plan.removed.length > 0) {
    const scored = await tx
      .select({ id: gradeScores.gradeComponentId, total: sql<number>`count(*)::int` })
      .from(gradeScores)
      .where(inArray(gradeScores.gradeComponentId, plan.removed.map((component) => component.id)))
      .groupBy(gradeScores.gradeComponentId);
    if (scored.length > 0 && !input.confirmDropScores) {
      const labelOf = new Map(existing.map((component) => [component.id, component.label]));
      const detail = scored.map((row) => `${labelOf.get(row.id)} (${row.total} điểm)`).join(", ");
      throw new GradeActionError(`Cột ${detail} đã có điểm. Xác nhận xóa cột thì điểm của cột đó cũng bị xóa.`);
    }
    await tx.delete(gradeComponents).where(inArray(gradeComponents.id, plan.removed.map((component) => component.id)));
  }
  const offset = 100;
  for (const component of plan.kept) {
    await tx
      .update(gradeComponents)
      .set({ label: component.label, weight: component.weight, position: offset + component.position })
      .where(eq(gradeComponents.id, component.id));
  }
  if (plan.created.length > 0) {
    await tx.insert(gradeComponents).values(plan.created.map((component) => ({ ...component, gradeSheetId: input.gradeSheetId })));
  }
  for (const component of plan.kept) {
    await tx.update(gradeComponents).set({ position: component.position }).where(eq(gradeComponents.id, component.id));
  }
  const before = existing.map((component) => `${component.label} ${component.weight}%`).join(", ");
  const after = input.components.map((component) => `${component.label} ${component.weight}%`).join(", ");
  return { before, after, removed: plan.removed.length, created: plan.created.length };
}

// ---------- Bảng điểm, kết quả tích lũy, cảnh báo chính thức (dùng chung cho grades, graduation, settings) ----------

const ID_CHUNK = 2000;

function chunked<T>(items: T[], size = ID_CHUNK) {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

export type TranscriptOptions = {
  // Học kỳ hiện tại: đánh dấu đang học (không tính CPA, không thay thế lần học trước).
  currentTermId?: string | null;
  // Chỉ lấy kết quả các học kỳ bắt đầu không sau ngày này (báo cáo theo học kỳ, xét cảnh báo một học kỳ).
  upToTermStart?: string;
  // Thêm học phần đang đăng ký của học kỳ hiện tại chưa có điểm (trang bảng điểm sinh viên).
  withOngoing?: boolean;
};

const transcriptCourse = (row: { courseCode: string; courseName: string; credits: number; score10: number | null; letter: string | null; point4: number | null; isConditional: boolean }) => ({
  courseCode: row.courseCode,
  courseName: row.courseName,
  credits: row.credits,
  score10: row.score10,
  letter: row.letter as ResultLetter | null,
  point4: row.point4,
  ...(row.isConditional ? { isConditional: true } : {}),
});

// Bảng điểm theo kỳ của nhiều sinh viên, một nguồn cho trang sinh viên, xét cảnh báo, xét tốt nghiệp, báo cáo: các kỳ có kết quả học phần
// (xếp theo ngày bắt đầu học kỳ, rồi thời điểm ghi điểm), cộng kỳ hiện tại lấy từ đăng ký nếu cần. Lấy theo danh sách id, chia lô.
export async function loadTranscripts(executor: Executor, studentIds: string[], options: TranscriptOptions = {}): Promise<Map<string, TranscriptTerm[]>> {
  const ids = [...new Set(studentIds.filter(isUuid))];
  const transcripts = new Map<string, TranscriptTerm[]>();
  if (ids.length === 0) return transcripts;
  const current = options.currentTermId ?? null;
  const batches = await Promise.all(
    chunked(ids).map((batch) =>
      Promise.all([
        executor
          .select({
            studentId: courseResults.studentId,
            termId: courseResults.termId,
            termName: terms.name,
            termStart: terms.startDate,
            enrollmentId: courseResults.enrollmentId,
            courseCode: courses.code,
            courseName: courses.name,
            credits: courses.credits,
            isConditional: courses.isConditional,
            score10: courseResults.score10,
            letter: courseResults.letter,
            point4: courseResults.point4,
          })
          .from(courseResults)
          .innerJoin(courses, eq(courses.id, courseResults.courseId))
          .innerJoin(terms, eq(terms.id, courseResults.termId))
          .where(and(inArray(courseResults.studentId, batch), options.upToTermStart ? lte(terms.startDate, options.upToTermStart) : undefined))
          .orderBy(asc(terms.startDate), asc(courseResults.recordedAt), asc(courses.code)),
        current && options.withOngoing
          ? executor
              .select({
                studentId: enrollments.studentId,
                enrollmentId: enrollments.id,
                termName: terms.name,
                termStart: terms.startDate,
                courseCode: courses.code,
                courseName: courses.name,
                credits: courses.credits,
                isConditional: courses.isConditional,
              })
              .from(enrollments)
              .innerJoin(courses, eq(courses.id, enrollments.courseId))
              .innerJoin(terms, eq(terms.id, enrollments.termId))
              .where(and(eq(enrollments.termId, current), eq(enrollments.status, "enrolled"), inArray(enrollments.studentId, batch)))
              .orderBy(asc(enrollments.registeredAt))
          : Promise.resolve([]),
      ]),
    ),
  );
  const results = batches.flatMap(([rows]) => rows);
  const ongoing = batches.flatMap(([, rows]) => rows);

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
    termOf(row.studentId, current!, row.termName, row.termStart).courses.push(transcriptCourse({ ...row, score10: result?.score10 ?? null, letter: result?.letter ?? null, point4: result?.point4 ?? null }));
  }
  // Kết quả của đăng ký đang học đã ghép vào dòng đăng ký ở trên; kết quả W của đăng ký đã rút vẫn hiện riêng.
  const ongoingIds = new Set(ongoing.map((row) => row.enrollmentId));
  for (const row of results) {
    if (row.termId === current && row.enrollmentId && options.withOngoing && ongoingIds.has(row.enrollmentId)) continue;
    termOf(row.studentId, row.termId, row.termName, row.termStart).courses.push(transcriptCourse(row));
  }
  for (const [studentId, byTerm] of raw) {
    const ordered = [...byTerm.values()].toSorted((a, b) => a.start.localeCompare(b.start)).map(({ start: _start, ...term }) => term);
    transcripts.set(studentId, buildTranscript(ordered));
  }
  return transcripts;
}

// Kết quả tích lũy (lần học cuối của mỗi học phần) tính trong SQL cho báo cáo toàn trường, không nạp từng dòng điểm:
// CPA làm tròn 2 chữ số như creditAverage, tín chỉ tích lũy (lần cuối đạt), tín chỉ nợ (lần cuối F). Cùng quy tắc ký hiệu với
// hasResult: W, I không phải lần học có kết quả; M là lần cuối, tính tín chỉ, không tính CPA (cpa null nếu chỉ có M).
export async function cumulativeResults(executor: Executor, options: { upToTermStart?: string; excludeCurrent?: boolean } = {}) {
  const latest = executor
    .selectDistinctOn([courseResults.studentId, courseResults.courseId], {
      studentId: courseResults.studentId,
      credits: courses.credits,
      point4: courseResults.point4,
      score10: courseResults.score10,
      letter: courseResults.letter,
    })
    .from(courseResults)
    .innerJoin(terms, eq(terms.id, courseResults.termId))
    .innerJoin(courses, eq(courses.id, courseResults.courseId))
    .where(
      and(
        or(isNotNull(courseResults.point4), eq(courseResults.letter, "M")),
        // Học phần điều kiện không tính CPA, tín chỉ tích lũy (countsTowardAverage trong grades.rule).
        eq(courses.isConditional, false),
        options.upToTermStart ? lte(terms.startDate, options.upToTermStart) : undefined,
        options.excludeCurrent ? eq(terms.isCurrent, false) : undefined,
      ),
    )
    .orderBy(courseResults.studentId, courseResults.courseId, desc(terms.startDate), desc(courseResults.recordedAt))
    .as("latest_results");
  const rows = await executor
    .select({
      studentId: latest.studentId,
      cpa4: sql<number | null>`round(sum(${latest.point4} * ${latest.credits}) / sum(${latest.credits}) FILTER (WHERE ${latest.point4} IS NOT NULL), 2)`.mapWith((value) => (value === null ? null : Number(value))),
      cpa10: sql<number | null>`round(sum(${latest.score10} * ${latest.credits}) / sum(${latest.credits}) FILTER (WHERE ${latest.score10} IS NOT NULL), 2)`.mapWith((value) => (value === null ? null : Number(value))),
      earnedCredits: sql<number>`coalesce(sum(${latest.credits}) FILTER (WHERE ${latest.letter} <> 'F'), 0)::int`.mapWith(Number),
      failedCredits: sql<number>`coalesce(sum(${latest.credits}) FILTER (WHERE ${latest.letter} = 'F'), 0)::int`.mapWith(Number),
    })
    .from(latest)
    .groupBy(latest.studentId);
  return new Map(rows.map(({ studentId, ...row }) => [studentId, row]));
}

// Cảnh báo chính thức đang có hiệu lực: học kỳ gần nhất có cảnh báo đã ban hành (đã gửi thông báo hoặc đã gặp sinh viên), lấy cảnh báo
// đã ban hành của sinh viên trong học kỳ đó. Cảnh báo mới sinh chưa gửi chưa có hiệu lực; học kỳ sau đã ban hành mà sinh viên không bị
// cảnh báo thì hết cảnh báo. Dùng cho hạn mức tín chỉ (đăng ký, kế hoạch học tập) và mọi chỗ hiện "đang bị cảnh báo".
export async function currentWarnings(executor: Executor, studentIds?: string[]): Promise<Map<string, CurrentWarning>> {
  const ids = studentIds?.filter(isUuid);
  if (ids && ids.length === 0) return new Map();
  const [issued] = await executor
    .select({ termId: terms.id, termName: terms.name })
    .from(academicWarnings)
    .innerJoin(terms, eq(terms.id, academicWarnings.termId))
    .where(ne(academicWarnings.status, "new"))
    .orderBy(desc(terms.startDate))
    .limit(1);
  if (!issued) return new Map();
  const rows = (
    await Promise.all(
      (ids ? chunked(ids) : [null]).map((batch) =>
        executor
          .select({ studentId: academicWarnings.studentId, level: academicWarnings.level })
          .from(academicWarnings)
          .where(and(eq(academicWarnings.termId, issued.termId), ne(academicWarnings.status, "new"), batch ? inArray(academicWarnings.studentId, batch) : undefined)),
      ),
    )
  ).flat();
  return new Map(rows.map((row) => [row.studentId, { level: row.level as 1 | 2 | 3, termId: issued.termId, termName: issued.termName }]));
}

// Mức cảnh báo chính thức của một sinh viên (0 là không bị cảnh báo), cho hạn mức tín chỉ khi đăng ký học phần.
export async function currentWarningLevel(executor: Executor, studentId: string): Promise<0 | 1 | 2 | 3> {
  return (await currentWarnings(executor, [studentId])).get(studentId)?.level ?? 0;
}

export type WarningSyncResult = {
  termId: string;
  termName: string;
  students: number;
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  handled: number;
  advisorsNotified: number;
};

// Tính cảnh báo học vụ sau một học kỳ đã kết thúc từ course_results (mọi kỳ đến hết học kỳ đó, lần học cuối của mỗi học phần) theo
// ngưỡng của bản quy chế đang áp dụng ngày xét, cho sinh viên có kết quả trong học kỳ và chưa tốt nghiệp. Chạy lại được: unique (sinh viên, học kỳ) và khóa theo học kỳ để hai lần chạy cùng lúc
// không chen nhau; cảnh báo đã gửi thông báo hoặc đã gặp sinh viên giữ nguyên. Cố vấn nhận thông báo khi lớp có cảnh báo mới.
export async function syncAcademicWarnings(tx: Transaction, termId: string, options: { notify?: boolean; today?: string } = {}): Promise<WarningSyncResult> {
  const today = options.today ?? schoolToday();
  const [term] = await tx.select({ id: terms.id, name: terms.name, semester: terms.semester, startDate: terms.startDate, endDate: terms.endDate }).from(terms).where(eq(terms.id, termId));
  if (!term) throw new GradeActionError("Học kỳ không còn trong danh mục, tải lại trang.");
  if (!isWarningTerm(term, today)) {
    throw new GradeActionError(term.semester === 3 ? "Học kỳ hè không xét cảnh báo học vụ riêng." : `${term.name} chưa kết thúc nên chưa xét cảnh báo được.`);
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`academic-warnings:${term.id}`}))`);

  const cohort = await tx
    .selectDistinct({ studentId: courseResults.studentId, className: administrativeClasses.code, advisorId: administrativeClasses.advisorId })
    .from(courseResults)
    .innerJoin(students, eq(students.id, courseResults.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(and(eq(courseResults.termId, term.id), ne(students.status, "graduated")));
  const ids = cohort.map((row) => row.studentId);

  const regulation = await regulationAt(tx, today);
  const transcripts = await loadTranscripts(tx, ids, { upToTermStart: term.startDate });
  const computed: ComputedWarning[] = [];
  for (const id of ids) {
    const warning = academicWarningOf(computeStanding(id, transcripts.get(id) ?? [], standingRulesOf(regulation)), regulation.warning);
    if (warning) computed.push({ ...warning, studentId: id });
  }

  const stored = await tx
    .select({
      id: academicWarnings.id,
      studentId: academicWarnings.studentId,
      status: academicWarnings.status,
      level: academicWarnings.level,
      termGpa4: academicWarnings.termGpa4,
      cpa4: academicWarnings.cpa4,
      failedCredits: academicWarnings.failedCredits,
      reasons: academicWarnings.reasons,
    })
    .from(academicWarnings)
    .where(eq(academicWarnings.termId, term.id))
    .for("update");
  const plan = planWarningSync(stored, computed);

  const created =
    plan.create.length > 0
      ? await tx
          .insert(academicWarnings)
          .values(plan.create.map((warning) => ({ ...warning, termId: term.id })))
          .onConflictDoNothing({ target: [academicWarnings.studentId, academicWarnings.termId] })
          .returning({ studentId: academicWarnings.studentId, level: academicWarnings.level })
      : [];
  for (const { id, studentId: _studentId, ...warning } of plan.update) {
    await tx.update(academicWarnings).set(warning).where(and(eq(academicWarnings.id, id), eq(academicWarnings.status, "new")));
  }
  if (plan.remove.length > 0) {
    await tx.delete(academicWarnings).where(and(inArray(academicWarnings.id, plan.remove), eq(academicWarnings.status, "new")));
  }

  let advisorsNotified = 0;
  if (options.notify !== false && created.length > 0) {
    const classOf = new Map(cohort.map((row) => [row.studentId, row]));
    const byClass = new Map<string, { advisorId: string; levels: number[] }>();
    for (const warning of created) {
      const home = classOf.get(warning.studentId);
      if (!home?.advisorId) continue;
      const entry = byClass.get(home.className) ?? { advisorId: home.advisorId, levels: [] };
      entry.levels.push(warning.level);
      byClass.set(home.className, entry);
    }
    for (const [className, { advisorId, levels }] of byClass) {
      const counts = [3, 2, 1].map((level) => [level, levels.filter((value) => value === level).length] as const).filter(([, total]) => total > 0);
      const notified = await notifyLecturers(tx, [advisorId], {
        kind: "advising",
        title: `Lớp ${className} có ${levels.length} sinh viên bị cảnh báo học vụ ${term.name.toLowerCase()}`,
        body: `${counts.map(([level, total]) => `${total} sinh viên mức ${level}`).join(", ")}. Xem danh sách và gửi thông báo cho sinh viên ở mục Cảnh báo học vụ.`,
        href: "/lecturer/advising/academic-warnings",
      });
      advisorsNotified += notified.length;
    }
  }

  return {
    termId: term.id,
    termName: term.name,
    students: ids.length,
    created: created.length,
    updated: plan.update.length,
    removed: plan.remove.length,
    unchanged: plan.unchanged,
    handled: plan.handled,
    advisorsNotified,
  };
}

// Tác vụ định kỳ: xét cảnh báo cho học kỳ chính vừa kết thúc. Gọi nhiều lần trong ngày cũng không sinh trùng.
export async function runAcademicWarningsJob(): Promise<Record<string, number>> {
  const today = schoolToday();
  const term = latestWarningTerm(await db.select({ id: terms.id, semester: terms.semester, endDate: terms.endDate }).from(terms), today);
  if (!term) return { students: 0, created: 0, updated: 0, removed: 0, unchanged: 0, handled: 0, advisorsNotified: 0 };
  const { termId: _termId, termName: _termName, ...counts } = await db.transaction((tx) => syncAcademicWarnings(tx, term.id, { today }));
  return counts;
}
