import type { Metadata } from "next";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { getCourses, getProgram, getProgramOf } from "@/modules/curriculum/curriculum.query";
import { getCurrentWarnings, getTranscript } from "@/modules/grades/grades.query";
import { latestGrades } from "@/modules/grades/grades.rule";
import { getRegulation } from "@/modules/settings/settings.query";
import { StudyPlanEditor } from "@/modules/study-plan/components/study-plan-editor";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import { compareTerms, parseTermName, termCreditLimitsByName, termNameOf, upcomingPlanTerms } from "@/modules/study-plan/study-plan.rule";
import { getAdvisorOf, getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Kế hoạch học tập" };

export default async function Page() {
  const [student, term, courses, regulation] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses(), getRegulation()]);
  const summary = await getProgramOf(student.majorCode, student.cohort);
  const [program, plan, advisor, transcript, warnings] = await Promise.all([
    summary ? getProgram(summary.id) : Promise.resolve(null),
    getStudyPlanOfStudent(student.id),
    getAdvisorOf(student.id),
    getTranscript(student.id),
    getCurrentWarnings([student.id]),
  ]);
  // Đã học: theo lần học cuối của từng học phần (lần cuối F là còn nợ, xếp vào kế hoạch được).
  const passedGrades = latestGrades(transcript);
  const prerequisites = Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes]));
  const inProgress = new Set(transcript.filter((entry) => entry.isInProgress).flatMap((entry) => entry.courses.map((course) => course.courseCode)));
  const isOpenCourse = (code: string) => (!passedGrades[code] || passedGrades[code] === "F") && !inProgress.has(code);
  const plannedCodes = new Set(plan?.terms.flatMap((entry) => entry.courses.map((course) => course.code)) ?? []);
  const pool = (program?.semesters.flatMap((semester) => semester.courses) ?? [])
    .filter((course) => isOpenCourse(course.code) && !plannedCodes.has(course.code))
    .map((course) => ({ code: course.code, name: course.name, credits: course.credits }));

  // Các cột học kỳ tính từ học kỳ hiện tại (3 học kỳ chính kế tiếp, kèm học kỳ hè xen giữa), cộng học kỳ sau đó đã có trong kế hoạch.
  const current = parseTermName(term.name);
  const upcoming = current ? upcomingPlanTerms(current) : [];
  const first = upcoming[0];
  const planTerms = (plan?.terms.map((entry) => parseTermName(entry.termName)) ?? []).filter((entry) => entry !== null && (!first || compareTerms(entry, first) >= 0));
  const termNames = [...new Map([...upcoming, ...planTerms].map((entry) => [termNameOf(entry!), entry!])).values()]
    .toSorted(compareTerms)
    .slice(0, 6)
    .map(termNameOf);
  const warned = Boolean(warnings[student.id]);
  const { credits } = regulation;
  const limits = Object.fromEntries(termNames.map((name) => [name, termCreditLimitsByName(name, credits, warned)]));
  const limitNote = warned
    ? `Bạn đang bị cảnh báo học vụ nên mỗi học kỳ chính tối đa ${credits.maxWhenWarned} tín chỉ; học kỳ hè tối đa ${credits.maxSummer} tín chỉ.`
    : `Mỗi học kỳ chính từ ${credits.minPerTerm} đến ${credits.maxPerTerm} tín chỉ; học kỳ hè không bắt buộc, tối đa ${credits.maxSummer} tín chỉ.`;

  return (
    <>
      <PageHeader
        title="Kế hoạch học tập"
        description="Xếp học phần cho các học kỳ tới. Kế hoạch được cố vấn duyệt là căn cứ để Phòng Đào tạo mở lớp và để bạn đăng ký học phần."
      />
      <StudyPlanEditor
        plan={plan}
        termNames={termNames}
        pool={pool}
        passedGrades={passedGrades}
        prerequisites={prerequisites}
        limits={limits}
        limitNote={limitNote}
        advisorName={advisor?.displayName ?? null}
      />
    </>
  );
}
