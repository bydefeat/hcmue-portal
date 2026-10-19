import "server-only";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { termNameOf } from "@/modules/study-plan/study-plan.rule";
import { studyPlanItems, studyPlans } from "@/modules/study-plan/study-plan.schema";
import type { StudyPlan, StudyPlanTerm } from "@/modules/study-plan/study-plan.type";
import { getCurrentStudent } from "@/modules/users/users.query";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Kế hoạch đang dùng (is_active) của sinh viên, học phần nhóm theo học kỳ theo thứ tự thời gian.
// Tín chỉ và học kỳ mục tiêu tính theo học kỳ đầu tiên của kế hoạch, như cố vấn xét duyệt.
async function planRows(where?: SQL): Promise<StudyPlan[]> {
  const plans = await db
    .select({
      id: studyPlans.id,
      studentId: studyPlans.studentId,
      studentCode: students.code,
      fullName: students.fullName,
      className: administrativeClasses.code,
      status: studyPlans.status,
      submittedAt: studyPlans.submittedAt,
      reviewedAt: studyPlans.reviewedAt,
      studentNote: studyPlans.studentNote,
      advisorComment: studyPlans.advisorComment,
    })
    .from(studyPlans)
    .innerJoin(students, eq(students.id, studyPlans.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(and(eq(studyPlans.isActive, true), where))
    .orderBy(asc(students.code));
  if (plans.length === 0) return [];
  const items = await db
    .select({
      studyPlanId: studyPlanItems.studyPlanId,
      academicYear: studyPlanItems.academicYear,
      semester: studyPlanItems.semester,
      code: courses.code,
      name: courses.name,
      credits: courses.credits,
    })
    .from(studyPlanItems)
    .innerJoin(courses, eq(courses.id, studyPlanItems.courseId))
    .where(
      inArray(
        studyPlanItems.studyPlanId,
        plans.map((plan) => plan.id),
      ),
    )
    .orderBy(asc(studyPlanItems.academicYear), asc(studyPlanItems.semester), asc(courses.code));
  const termsOf = new Map<string, StudyPlanTerm[]>();
  for (const { studyPlanId, academicYear, semester, ...course } of items) {
    const terms = termsOf.get(studyPlanId) ?? [];
    const termName = termNameOf({ academicYear, semester });
    let term = terms.at(-1);
    if (term?.termName !== termName) {
      term = { termName, courses: [] };
      terms.push(term);
    }
    term.courses.push(course);
    termsOf.set(studyPlanId, terms);
  }
  return plans.map((plan) => {
    const terms = termsOf.get(plan.id) ?? [];
    return {
      ...plan,
      studentCode: formatStudentCode(plan.studentCode),
      submittedAt: plan.submittedAt?.toISOString() ?? null,
      reviewedAt: plan.reviewedAt?.toISOString() ?? null,
      targetTermName: terms[0]?.termName ?? "Chưa xếp học kỳ",
      totalCredits: terms[0]?.courses.reduce((sum, course) => sum + course.credits, 0) ?? 0,
      terms,
    };
  });
}

// Sinh viên chỉ xem được kế hoạch của chính mình; giảng viên, cán bộ xem theo danh sách được truyền vào.
async function visibleStudentIds(studentIds: string[]) {
  const session = await requireSession();
  const valid = studentIds.filter(isUuid);
  if (session.roles.some((role) => role !== "student")) return valid;
  const student = await getCurrentStudent();
  return valid.filter((id) => id === student.id);
}

export async function getStudyPlans(studentIds?: string[]) {
  if (studentIds === undefined) {
    const session = await requireSession();
    if (!session.roles.some((role) => role !== "student")) return [];
    return planRows();
  }
  const ids = await visibleStudentIds(studentIds);
  return ids.length > 0 ? planRows(inArray(studyPlans.studentId, ids)) : [];
}

export async function getStudyPlanOfStudent(studentId: string) {
  const [id] = await visibleStudentIds([studentId]);
  if (!id) return null;
  const [plan] = await planRows(eq(studyPlans.studentId, id));
  return plan ?? null;
}
