import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { mockDate, mockId } from "@/shared/libs/mock.lib";
import { CLASS_SECTIONS } from "@/modules/course-registration/course-registration.mock";
import { enrollments } from "@/modules/course-registration/course-registration.schema";
import {
  CURRENT_TERM,
  DEFAULT_SHEET_SEED,
  GRADE_SHEET_SEEDS,
  mockScoreRow,
  mockTranscriptTerms,
  mockWarningMeta,
  RETURN_REASON,
  SHEET_LOCKED_AT,
  SHEET_SAVED_AT,
  WARNING_TERM_KEY,
} from "@/modules/grades/grades.mock";
import { academicWarningOf, buildTranscript, computeStanding, courseGrade, standingRulesOf, weightedScore } from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { GradeSheetStatus } from "@/modules/grades/grades.type";
import { REGULATION_RULES } from "@/modules/settings/settings.mock";
import { STUDENTS } from "@/modules/users/users.mock";
import type { SeedContext } from "./context";

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 1000) {
  for (let start = 0; start < rows.length; start += size) await insert(rows.slice(start, start + size));
}

// Bảng điểm các kỳ đã học của 600 sinh viên mẫu (course_results, nguồn "legacy" vì không có lớp học phần các kỳ cũ),
// bảng điểm lớp học phần kỳ hiện tại (grade_sheets, grade_components, grade_scores), cảnh báo học vụ.
export async function seedGrades(tx: Transaction, context: SeedContext) {
  // STUDENTS[index] là sinh viên mockId(`student:${index}`).
  const transcripts = STUDENTS.map((student, index) => ({ student, index, terms: mockTranscriptTerms(index).filter((term) => !term.isInProgress) }));

  const termById = new Map([...context.termByKey.values()].map((term) => [term.id, term]));

  // Tên và số tín chỉ lấy theo danh mục học phần (nguồn duy nhất), điểm lấy theo dữ liệu mẫu.
  const results: (typeof courseResults.$inferInsert)[] = [];
  const warnings: (typeof academicWarnings.$inferInsert)[] = [];
  for (const { student, index, terms } of transcripts) {
    const catalogTerms = terms.map((term) => ({
      ...term,
      courses: term.courses.map((course) => {
        const catalog = context.courseByCode.get(course.courseCode)!;
        return { ...course, courseName: catalog.name, credits: catalog.credits };
      }),
    }));
    for (const term of catalogTerms) {
      const recordedAt = dayjs(termById.get(term.termId)!.endDate).add(7, "day").hour(9);
      term.courses.forEach((course, position) => {
        results.push({
          id: mockId(`result:${student.id}:${term.termId}:${course.courseCode}`),
          studentId: student.id,
          courseId: context.courseByCode.get(course.courseCode)!.id,
          termId: term.termId,
          source: "legacy",
          score10: course.score10,
          letter: course.letter,
          point4: course.point4,
          recordedAt: recordedAt.add(position, "minute").toDate(),
        });
      });
    }
    // Cùng cách tính với syncAcademicWarnings (grades.lib): sinh viên có kết quả trong học kỳ xét và chưa tốt nghiệp,
    // nên bấm "Sinh cảnh báo" cho học kỳ này trên dữ liệu mẫu không tạo thêm hay đổi cảnh báo nào.
    const warningTermId = context.termByKey.get(WARNING_TERM_KEY)!.id;
    const warning = academicWarningOf(computeStanding(student.id, buildTranscript(catalogTerms), standingRulesOf(REGULATION_RULES)), REGULATION_RULES.warning);
    if (warning && student.status !== "graduated" && terms.some((term) => term.termId === warningTermId)) {
      const meta = mockWarningMeta(index);
      warnings.push({ ...warning, id: meta.id, studentId: student.id, termId: warningTermId, status: meta.status, createdAt: new Date(meta.createdAt) });
    }
  }
  await insertChunks(results, (chunk) => tx.insert(courseResults).values(chunk));
  await insertChunks(warnings, (chunk) => tx.insert(academicWarnings).values(chunk));

  // Mọi lớp đang mở của kỳ hiện tại đều có bảng điểm; danh sách lớp lấy từ enrollments.
  const sections = CLASS_SECTIONS.filter((section) => section.termId === CURRENT_TERM.id && section.status === "open");
  const roster = await tx
    .select({ id: enrollments.id, studentId: enrollments.studentId, classSectionId: enrollments.classSectionId, courseId: enrollments.courseId })
    .from(enrollments)
    .where(and(inArray(enrollments.classSectionId, sections.map((section) => section.id)), eq(enrollments.status, "enrolled")));
  const sheets = sections.map((section) => ({ section, seed: GRADE_SHEET_SEEDS[section.id] ?? DEFAULT_SHEET_SEED, id: mockId(`grade-sheet:${section.id}`) }));
  await tx.insert(gradeSheets).values(
    sheets.map(({ section, seed, id }) => ({ id, classSectionId: section.id, deadline: new Date(seed.deadline), savedAt: new Date(SHEET_SAVED_AT) })),
  );
  await tx.insert(gradeComponents).values(
    sheets.flatMap(({ section, seed, id }) =>
      seed.components.map((component, position) => ({
        id: mockId(`grade-component:${section.id}:${component.key}`),
        gradeSheetId: id,
        key: component.key,
        label: component.label,
        weight: component.weight,
        position: position + 1,
      })),
    ),
  );
  const scores: (typeof gradeScores.$inferInsert)[] = [];
  const published: (typeof courseResults.$inferInsert)[] = [];
  for (const { section, seed } of sheets) {
    for (const enrollment of roster.filter((entry) => entry.classSectionId === section.id)) {
      const row = mockScoreRow(section.id, enrollment.studentId, seed);
      for (const component of seed.components) {
        const score = row[component.key];
        if (score !== null) scores.push({ gradeComponentId: mockId(`grade-component:${section.id}:${component.key}`), enrollmentId: enrollment.id, score });
      }
      const total = weightedScore(seed.components, row, REGULATION_RULES.grading.roundingStep);
      if (seed.status === "published" && total !== null) {
        published.push({
          id: mockId(`result:${enrollment.studentId}:${CURRENT_TERM.id}:${section.courseCode}`),
          studentId: enrollment.studentId,
          courseId: enrollment.courseId,
          termId: CURRENT_TERM.id,
          enrollmentId: enrollment.id,
          source: "class",
          ...courseGrade(total, REGULATION_RULES.grading.scale),
          recordedAt: new Date(mockDate(-2, "15:00")),
        });
      }
    }
  }
  await insertChunks(scores, (chunk) => tx.insert(gradeScores).values(chunk));

  // Đi đúng quy trình như trigger grade_sheets_status_flow yêu cầu: nháp → chốt → duyệt hoặc trả lại → công bố.
  const steps: Record<GradeSheetStatus, GradeSheetStatus[]> = {
    draft: [],
    locked: ["locked"],
    returned: ["locked", "returned"],
    approved: ["locked", "approved"],
    published: ["locked", "approved", "published"],
  };
  for (const { seed, id } of sheets) {
    for (const status of steps[seed.status]) {
      await tx
        .update(gradeSheets)
        .set({
          status,
          ...(status === "locked" && { lockedAt: new Date(SHEET_LOCKED_AT), savedAt: null }),
          ...(status === "returned" && { returnReason: RETURN_REASON }),
          ...(status === "approved" && { approvedAt: new Date(mockDate(-4, "10:00")) }),
          ...(status === "published" && { publishedAt: new Date(mockDate(-2, "15:00")) }),
        })
        .where(eq(gradeSheets.id, id));
    }
  }
  await insertChunks(published, (chunk) => tx.insert(courseResults).values(chunk));

  return { results: results.length + published.length, sheets: sheets.length, scores: scores.length, warnings: warnings.length };
}
