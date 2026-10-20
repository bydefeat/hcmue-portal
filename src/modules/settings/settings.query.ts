import "server-only";
import { cache } from "react";
import { and, asc, avg, count, countDistinct, desc, eq, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { schoolToday } from "@/shared/libs/date.lib";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { user } from "@/modules/authentication/authentication.schema";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { CLASS_SECTION_STATUS } from "@/modules/course-registration/course-registration.constant";
import { classSections, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { STANDING_LABEL, UNRANKED_LABEL, WARNING_STATUS } from "@/modules/grades/grades.constant";
import { cumulativeResults } from "@/modules/grades/grades.lib";
import { toStanding } from "@/modules/grades/grades.rule";
import { academicWarnings } from "@/modules/grades/grades.schema";
import { GRADUATION_STATUS } from "@/modules/graduation/graduation.constant";
import { loadGraduationCandidates } from "@/modules/graduation/graduation.lib";
import { surveyAnswers, surveyResponses, surveys } from "@/modules/surveys/surveys.schema";
import { STUDENT_STATUS } from "@/modules/users/users.constant";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { REPORT_DEFINITIONS } from "@/modules/settings/settings.constant";
import { regulationAt, REGULATION_COLUMNS, toRegulation } from "@/modules/settings/settings.lib";
import { calendarEvents, regulations, reportExports } from "@/modules/settings/settings.schema";
import type { CalendarEvent, RegulationSettings, RegulationVersion, ReportCell, ReportExportJob, ReportExportStatus } from "@/modules/settings/settings.type";

// Bản quy chế đang áp dụng hôm nay (giờ Việt Nam). Nhiều trang và quy tắc (đăng ký, điểm danh, điểm, cảnh báo) gọi trong cùng request
// nên cache theo request. Module khác cần tham số quy chế thì gọi hàm này (hoặc regulationAt trong settings.lib khi ở trong transaction).
export const getRegulation = cache(async (): Promise<RegulationSettings> => getRegulationAt(schoolToday()));

// Bản quy chế áp dụng tại một ngày ("YYYY-MM-DD", ngày của trường).
export const getRegulationAt = cache(async (date: string): Promise<RegulationSettings> => {
  await requireSession();
  return regulationAt(db, date);
});

// Trang sửa quy chế mở bản mới nhất, kể cả bản đã lưu nhưng chưa tới ngày áp dụng.
export async function getLatestRegulation(): Promise<RegulationSettings> {
  await requirePermission("settings.manage");
  const [row] = await db.select(REGULATION_COLUMNS).from(regulations).leftJoin(user, eq(user.id, regulations.createdByUserId)).orderBy(desc(regulations.effectiveFrom)).limit(1);
  if (!row) throw new Error("Chưa có quy chế đào tạo trong hệ thống");
  return toRegulation(row);
}

// Công khai (trang Giới thiệu): lịch sử các bản quy chế.
export async function getRegulationVersions(): Promise<RegulationVersion[]> {
  return db
    .select({ version: regulations.version, effectiveFrom: regulations.effectiveFrom, decision: regulations.decision, summary: regulations.summary })
    .from(regulations)
    .orderBy(desc(regulations.effectiveFrom));
}

export const CALENDAR_EVENT_COLUMNS = {
  id: calendarEvents.id,
  termId: calendarEvents.termId,
  kind: calendarEvents.kind,
  title: calendarEvents.title,
  startDate: calendarEvents.startDate,
  endDate: calendarEvents.endDate,
  audience: calendarEvents.audience,
};

// Công khai: lịch năm học hiện trên trang chủ.
export async function getCalendarEvents(termId?: string): Promise<CalendarEvent[]> {
  return db
    .select(CALENDAR_EVENT_COLUMNS)
    .from(calendarEvents)
    .where(termId ? eq(calendarEvents.termId, termId) : undefined)
    .orderBy(asc(calendarEvents.startDate), asc(calendarEvents.id));
}

const JOB_STATUS: Record<"queued" | "running" | "done" | "failed", ReportExportStatus> = { queued: "running", running: "running", done: "ready", failed: "failed" };

export type ReportParams = { termId: string; faculty: string; format: string };

export async function getReportExports(id?: string): Promise<ReportExportJob[]> {
  const viewer = await requirePermission("reports.view");
  const [rows, termRows] = await Promise.all([
    db
      .select({
        id: reportExports.id,
        reportKey: reportExports.reportKey,
        params: reportExports.params,
        status: reportExports.status,
        rowCount: reportExports.rowCount,
        createdAt: reportExports.createdAt,
        createdBy: user.name,
      })
      .from(reportExports)
      .leftJoin(user, eq(user.id, reportExports.requestedByUserId))
      .where(id ? eq(reportExports.id, id) : viewer.faculty ? sql`${reportExports.params}->>'faculty' = ${viewer.faculty}` : undefined)
      .orderBy(desc(reportExports.createdAt))
      .limit(100),
    db.select({ id: terms.id, shortName: terms.shortName }).from(terms),
  ]);
  const termName = new Map(termRows.map((term) => [term.id, term.shortName]));
  return rows.map((row) => {
    const params = row.params as Partial<ReportParams>;
    const scope = !params.faculty || params.faculty === "all" ? "toàn trường" : params.faculty;
    return {
      id: row.id,
      reportId: row.reportKey,
      reportName: REPORT_DEFINITIONS.find((report) => report.id === row.reportKey)?.name ?? row.reportKey,
      params: [params.termId ? termName.get(params.termId) : null, scope].filter(Boolean).join(", "),
      format: (params.format ?? "").toUpperCase(),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy ?? "Hệ thống",
      status: JOB_STATUS[row.status],
      rows: row.rowCount,
    };
  });
}

export type ReportTable = { header: string[]; rows: ReportCell[][] };

// Tỉ lệ và điểm giữ cả giá trị số (để Excel tính được) lẫn chữ theo kiểu Việt Nam (dấu phẩy thập phân) cho CSV.
const percent = (part: number, whole: number): ReportCell =>
  whole > 0 ? { value: Math.round((part / whole) * 1000) / 1000, text: `${Math.round((part / whole) * 1000) / 10}%`.replace(".", ","), numFmt: "0.0%" } : "";
const decimal = (value: number | null, digits = 2): ReportCell =>
  value === null ? "" : { value: Number(value.toFixed(digits)), text: value.toFixed(digits).replace(".", ","), numFmt: `0.${"0".repeat(digits)}` };

// Bảng dữ liệu của từng báo cáo theo học kỳ và khoa ("all" là toàn trường), đọc trên dữ liệu hiện tại lúc gọi.
// Chưa có kho lưu tệp nên mỗi lần tải là đọc lại; trả null khi học kỳ không còn hoặc báo cáo không có trong danh mục.
export async function getReportTable(reportKey: string, termId: string, faculty: string): Promise<ReportTable | null> {
  await requirePermission("reports.view");
  const [term] = await db.select({ startDate: terms.startDate }).from(terms).where(eq(terms.id, termId));
  if (!term) return null;
  const byFaculty = faculty === "all" ? undefined : eq(faculties.name, faculty);
  const studentColumns = { id: students.id, code: students.code, fullName: students.fullName, className: administrativeClasses.code, faculty: faculties.name };

  switch (reportKey) {
    case "moet": {
      const rows = await db
        .select({ faculty: faculties.name, major: majors.name, cohort: administrativeClasses.cohort, status: students.status, total: count() })
        .from(students)
        .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
        .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
        .innerJoin(faculties, eq(faculties.id, majors.facultyId))
        .where(byFaculty)
        .groupBy(faculties.name, majors.name, administrativeClasses.cohort, students.status)
        .orderBy(faculties.name, majors.name, administrativeClasses.cohort);
      const statuses = Object.keys(STUDENT_STATUS) as (keyof typeof STUDENT_STATUS)[];
      const groups = new Map<string, { faculty: string; major: string; cohort: number; counts: Record<string, number> }>();
      for (const row of rows) {
        const key = `${row.major}:${row.cohort}`;
        const group = groups.get(key) ?? { faculty: row.faculty, major: row.major, cohort: row.cohort, counts: {} };
        group.counts[row.status] = row.total;
        groups.set(key, group);
      }
      return {
        header: ["Khoa", "Ngành", "Khóa", ...statuses.map((status) => STUDENT_STATUS[status].label), "Tổng"],
        rows: [...groups.values()].map((group) => [
          group.faculty,
          group.major,
          group.cohort,
          ...statuses.map((status) => group.counts[status] ?? 0),
          Object.values(group.counts).reduce((sum, value) => sum + value, 0),
        ]),
      };
    }
    case "standing": {
      // CPA, tín chỉ theo lần học cuối của mỗi học phần đến hết học kỳ đã chọn, tính trong SQL; chưa có điểm thì Chưa xếp loại.
      const [people, results, regulation] = await Promise.all([
        db
          .select(studentColumns)
          .from(students)
          .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
          .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
          .innerJoin(faculties, eq(faculties.id, majors.facultyId))
          .where(and(eq(students.status, "studying"), byFaculty))
          .orderBy(faculties.name, administrativeClasses.code, students.code),
        cumulativeResults(db, { upToTermStart: term.startDate }),
        getRegulation(),
      ]);
      return {
        header: ["MSSV", "Họ và tên", "Lớp", "Khoa", "Tín chỉ tích lũy", "Tín chỉ nợ", "CPA hệ 4", "CPA hệ 10", "Xếp loại"],
        rows: people.map((person) => {
          const result = results.get(person.id);
          return [
            formatStudentCode(person.code),
            person.fullName,
            person.className,
            person.faculty,
            result?.earnedCredits ?? 0,
            result?.failedCredits ?? 0,
            decimal(result?.cpa4 ?? null),
            decimal(result?.cpa10 ?? null),
            result ? STANDING_LABEL[toStanding(result.cpa4, regulation.grading.standing)] : UNRANKED_LABEL,
          ];
        }),
      };
    }
    case "warnings": {
      const rows = await db
        .select({ ...studentColumns, level: academicWarnings.level, cpa4: academicWarnings.cpa4, termGpa4: academicWarnings.termGpa4, failedCredits: academicWarnings.failedCredits, reasons: academicWarnings.reasons, status: academicWarnings.status })
        .from(academicWarnings)
        .innerJoin(students, eq(students.id, academicWarnings.studentId))
        .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
        .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
        .innerJoin(faculties, eq(faculties.id, majors.facultyId))
        .where(and(eq(academicWarnings.termId, termId), byFaculty))
        .orderBy(desc(academicWarnings.level), faculties.name, students.code);
      return {
        header: ["MSSV", "Họ và tên", "Lớp", "Khoa", "Mức cảnh báo", "GPA học kỳ", "CPA", "Tín chỉ nợ", "Lý do", "Trạng thái xử lý"],
        rows: rows.map((row) => [
          formatStudentCode(row.code),
          row.fullName,
          row.className,
          row.faculty,
          `Mức ${row.level}`,
          decimal(row.termGpa4),
          decimal(row.cpa4),
          row.failedCredits,
          row.reasons.join("; "),
          WARNING_STATUS[row.status].label,
        ]),
      };
    }
    case "registration": {
      const rows = await db
        .select({ code: classSections.code, course: courses.name, faculty: faculties.name, lecturer: lecturers.fullName, capacity: classSections.capacity, enrolled: classSections.enrolledCount, status: classSections.status })
        .from(classSections)
        .innerJoin(courses, eq(courses.id, classSections.courseId))
        .innerJoin(faculties, eq(faculties.id, courses.facultyId))
        .leftJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
        .where(and(eq(classSections.termId, termId), byFaculty))
        .orderBy(faculties.name, classSections.code);
      return {
        header: ["Mã lớp", "Học phần", "Khoa", "Giảng viên", "Trạng thái", "Chỉ tiêu", "Đã đăng ký", "Tỉ lệ lấp đầy"],
        rows: rows.map((row) => [row.code, row.course, row.faculty, row.lecturer ?? "", CLASS_SECTION_STATUS[row.status].label, row.capacity, row.enrolled, percent(row.enrolled, row.capacity)]),
      };
    }
    case "surveys": {
      const rows = await db
        .select({
          code: classSections.code,
          course: courses.name,
          faculty: faculties.name,
          lecturer: lecturers.fullName,
          enrolled: classSections.enrolledCount,
          responses: countDistinct(surveyResponses.id),
          average: avg(surveyAnswers.score).mapWith(Number),
        })
        .from(surveyResponses)
        .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
        .innerJoin(classSections, eq(classSections.id, surveyResponses.classSectionId))
        .innerJoin(courses, eq(courses.id, classSections.courseId))
        .innerJoin(faculties, eq(faculties.id, courses.facultyId))
        .leftJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
        .leftJoin(surveyAnswers, eq(surveyAnswers.responseId, surveyResponses.id))
        .where(and(eq(surveys.termId, termId), byFaculty))
        .groupBy(classSections.id, courses.name, faculties.name, lecturers.fullName)
        .orderBy(faculties.name, classSections.code);
      return {
        header: ["Mã lớp", "Học phần", "Khoa", "Giảng viên", "Sĩ số", "Số phiếu", "Tỉ lệ phản hồi", "Điểm trung bình (thang 5)"],
        rows: rows.map((row) => [row.code, row.course, row.faculty, row.lecturer ?? "", row.enrolled, row.responses, percent(row.responses, row.enrolled), decimal(row.average)]),
      };
    }
    case "graduation": {
      // Cùng kết quả xét với trang Xét tốt nghiệp (đợt đang mở): điều kiện, hạng tốt nghiệp đã xét giảm hạng.
      const { candidates } = await loadGraduationCandidates({ faculty: faculty === "all" ? null : faculty });
      const check = (candidate: (typeof candidates)[number], key: string) => candidate.checks.find((entry) => entry.key === key);
      return {
        header: ["MSSV", "Họ và tên", "Lớp", "Khoa", "Tín chỉ tích lũy", "Tín chỉ yêu cầu", "CPA hệ 4", "Hạng tốt nghiệp", "Chuẩn ngoại ngữ", "Chuẩn tin học", "Học phí", "Kỷ luật", "Điều kiện chưa đạt", "Trạng thái"],
        rows: candidates.map((candidate) => [
          candidate.code,
          candidate.fullName,
          candidate.className,
          candidate.faculty,
          candidate.earnedCredits,
          candidate.requiredCredits,
          decimal(candidate.cpa4),
          candidate.classification,
          check(candidate, "language")?.detail ?? "",
          check(candidate, "it")?.detail ?? "",
          check(candidate, "tuition")?.detail ?? "",
          check(candidate, "discipline")?.detail ?? "",
          candidate.checks
            .filter((entry) => !entry.passed)
            .map((entry) => entry.label)
            .join("; "),
          GRADUATION_STATUS[candidate.status].label,
        ]),
      };
    }
    default:
      return null;
  }
}
