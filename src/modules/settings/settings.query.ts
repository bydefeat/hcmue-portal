import "server-only";
import { cache } from "react";
import { and, asc, avg, count, countDistinct, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { can } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { user } from "@/modules/authentication/authentication.schema";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { schoolTime } from "@/shared/libs/date.lib";
import { CLASS_SECTION_STATUS } from "@/modules/course-registration/course-registration.constant";
import { classSections, registrationPeriods, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { STANDING_LABEL, WARNING_STATUS } from "@/modules/grades/grades.constant";
import { buildTranscript, computeStanding, type TranscriptTermInput } from "@/modules/grades/grades.rule";
import type { TranscriptCourse } from "@/modules/grades/grades.type";
import { academicWarnings, courseResults } from "@/modules/grades/grades.schema";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { surveyAnswers, surveyResponses, surveys } from "@/modules/surveys/surveys.schema";
import { STUDENT_STATUS } from "@/modules/users/users.constant";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { REPORT_DEFINITIONS } from "@/modules/settings/settings.constant";
import { calendarEvents, regulations, reportExports, type RegulationRules } from "@/modules/settings/settings.schema";
import type { CalendarEvent, RegulationSettings, RegulationVersion, ReportCell, ReportExportJob, ReportExportStatus } from "@/modules/settings/settings.type";

const REGULATION_COLUMNS = {
  version: regulations.version,
  effectiveFrom: regulations.effectiveFrom,
  rules: regulations.rules,
  createdAt: regulations.createdAt,
  createdBy: user.name,
};

type RegulationRow = { version: string; effectiveFrom: string; rules: RegulationRules; createdAt: Date; createdBy: string | null };

function toRegulation({ version, effectiveFrom, rules, createdAt, createdBy }: RegulationRow): RegulationSettings {
  return { version, effectiveFrom, updatedAt: createdAt.toISOString(), updatedBy: createdBy ?? "Hệ thống", ...rules };
}

// Bản quy chế đang áp dụng hôm nay: ngày áp dụng gần nhất không sau hôm nay. Chưa có bản nào tới ngày thì lấy bản sớm nhất.
// Nhiều trang và quy tắc (đăng ký, điểm danh, lịch thi) gọi trong cùng request nên cache theo request.
export const getRegulation = cache(async (): Promise<RegulationSettings> => {
  await requireSession();
  const [row] = await db
    .select(REGULATION_COLUMNS)
    .from(regulations)
    .leftJoin(user, eq(user.id, regulations.createdByUserId))
    .orderBy(sql`${regulations.effectiveFrom} <= current_date DESC`, sql`CASE WHEN ${regulations.effectiveFrom} <= current_date THEN ${regulations.effectiveFrom} END DESC`, asc(regulations.effectiveFrom))
    .limit(1);
  if (!row) throw new Error("Chưa có quy chế đào tạo trong hệ thống");
  return toRegulation(row);
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

// Công khai: lịch năm học hiện trên trang chủ. Thời gian học kỳ và đợt đăng ký đọc thẳng từ học kỳ, đợt đăng ký (một nguồn
// ngày duy nhất, chỉ đọc ở đây); mốc tự nhập là các sự kiện khác (thi, nhập điểm, nghỉ lễ, sự kiện).
export async function getCalendarEvents(termId?: string): Promise<CalendarEvent[]> {
  const [manual, termRows, periods] = await Promise.all([
    db
      .select(CALENDAR_EVENT_COLUMNS)
      .from(calendarEvents)
      .where(termId ? eq(calendarEvents.termId, termId) : undefined),
    db
      .select({ id: terms.id, name: terms.name, startDate: terms.startDate, endDate: terms.endDate })
      .from(terms)
      .where(termId ? eq(terms.id, termId) : undefined),
    db
      .select({ id: registrationPeriods.id, termId: registrationPeriods.termId, name: registrationPeriods.name, cohorts: registrationPeriods.cohorts, opensAt: registrationPeriods.opensAt, closesAt: registrationPeriods.closesAt })
      .from(registrationPeriods)
      .where(termId ? eq(registrationPeriods.termId, termId) : undefined),
  ]);
  const events: CalendarEvent[] = [
    ...manual.map((event) => ({ ...event, source: "manual" as const })),
    ...termRows.map((term) => ({
      id: `term:${term.id}`,
      termId: term.id,
      kind: "teaching" as const,
      title: `Thời gian ${term.name.charAt(0).toLowerCase()}${term.name.slice(1)}`,
      startDate: term.startDate,
      endDate: term.endDate,
      audience: "Toàn trường",
      source: "term" as const,
    })),
    ...periods.map((period) => ({
      id: `registration:${period.id}`,
      termId: period.termId,
      kind: "registration" as const,
      title: `Đăng ký học phần: ${period.name}`,
      startDate: schoolTime(period.opensAt).format("YYYY-MM-DD"),
      endDate: schoolTime(period.closesAt).format("YYYY-MM-DD"),
      audience: `Khóa ${period.cohorts.toSorted((a, b) => a - b).join(", ")}`,
      source: "registration" as const,
    })),
  ];
  return events.toSorted((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

const JOB_STATUS: Record<"queued" | "running" | "done" | "failed", ReportExportStatus> = { queued: "running", running: "running", done: "ready", failed: "failed" };

export type ReportParams = { termId: string; faculty: string; format: string };

// Lịch sử xuất: chỉ báo cáo mà vai trò đang dùng được xem (khảo sát cần surveys.view, xét tốt nghiệp cần graduation.manage),
// cán bộ theo khoa chỉ thấy báo cáo của khoa mình.
export async function getReportExports(id?: string): Promise<ReportExportJob[]> {
  const viewer = await requirePermission("reports.view");
  const allowedKeys = REPORT_DEFINITIONS.filter((report) => can(viewer, report.permission)).map((report) => report.id);
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
      .where(
        and(
          inArray(reportExports.reportKey, allowedKeys),
          id ? eq(reportExports.id, id) : undefined,
          viewer.faculty ? sql`${reportExports.params}->>'faculty' = ${viewer.faculty}` : undefined,
        ),
      )
      .orderBy(desc(reportExports.createdAt))
      .limit(100),
    db.select({ id: terms.id, shortName: terms.shortName }).from(terms),
  ]);
  const termName = new Map(termRows.map((term) => [term.id, term.shortName]));
  return rows.map((row) => {
    const params = row.params as Partial<ReportParams>;
    const scope = !params.faculty || params.faculty === "all" ? "toàn trường" : params.faculty;
    const report = REPORT_DEFINITIONS.find((entry) => entry.id === row.reportKey);
    return {
      id: row.id,
      reportId: row.reportKey,
      reportName: report?.name ?? row.reportKey,
      // Báo cáo số liệu hiện tại (không theo học kỳ) không ghi học kỳ.
      params: [report?.usesTerm && params.termId ? termName.get(params.termId) : null, scope].filter(Boolean).join(", "),
      format: (params.format ?? "").toUpperCase(),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy ?? "Hệ thống",
      status: JOB_STATUS[row.status],
      rows: row.rowCount,
    };
  });
}

export type ReportTable = { header: string[]; rows: ReportCell[][] };

const GRADUATION_RECORD_LABEL = { pending: "Chờ xét", approved: "Hội đồng đã công nhận", graduated: "Đã tốt nghiệp" } as const;

// Tỉ lệ và điểm giữ cả giá trị số (để Excel tính được) lẫn chữ theo kiểu Việt Nam (dấu phẩy thập phân) cho CSV.
const percent = (part: number, whole: number): ReportCell =>
  whole > 0 ? { value: Math.round((part / whole) * 1000) / 1000, text: `${Math.round((part / whole) * 1000) / 10}%`.replace(".", ","), numFmt: "0.0%" } : "";
const decimal = (value: number | null, digits = 2): ReportCell =>
  value === null ? "" : { value: Number(value.toFixed(digits)), text: value.toFixed(digits).replace(".", ","), numFmt: `0.${"0".repeat(digits)}` };

// Bảng dữ liệu của từng báo cáo theo học kỳ và khoa ("all" là toàn trường), đọc trên dữ liệu hiện tại lúc gọi; action xuất
// dựng tệp từ bảng này một lần và lưu vào kho (tải về là tệp đã lưu). Trả null khi học kỳ không còn hoặc báo cáo không có
// trong danh mục. Báo cáo moet, graduation là số liệu hiện tại, không lọc theo học kỳ.
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
      const [people, results] = await Promise.all([
        db
          .select(studentColumns)
          .from(students)
          .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
          .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
          .innerJoin(faculties, eq(faculties.id, majors.facultyId))
          .where(and(eq(students.status, "studying"), byFaculty))
          .orderBy(faculties.name, administrativeClasses.code, students.code),
        db
          .select({
            studentId: courseResults.studentId,
            termId: courseResults.termId,
            termName: terms.name,
            courseCode: courses.code,
            courseName: courses.name,
            credits: courses.credits,
            score10: courseResults.score10,
            letter: courseResults.letter,
            point4: courseResults.point4,
          })
          .from(courseResults)
          .innerJoin(terms, eq(terms.id, courseResults.termId))
          .innerJoin(courses, eq(courses.id, courseResults.courseId))
          .where(and(isNotNull(courseResults.point4), lte(terms.startDate, term.startDate)))
          .orderBy(terms.startDate),
      ]);
      // Kết quả theo sinh viên, giữ thứ tự học kỳ để CPA tính như trang kết quả học tập.
      const termsOf = new Map<string, Map<string, TranscriptTermInput>>();
      for (const { studentId, termId: resultTermId, termName, letter, ...course } of results) {
        const byTerm = termsOf.get(studentId) ?? new Map<string, TranscriptTermInput>();
        const entry = byTerm.get(resultTermId) ?? { termId: resultTermId, termName, isInProgress: false, courses: [] };
        entry.courses.push({ ...course, letter: letter as TranscriptCourse["letter"] });
        byTerm.set(resultTermId, entry);
        termsOf.set(studentId, byTerm);
      }
      return {
        header: ["MSSV", "Họ và tên", "Lớp", "Khoa", "Tín chỉ tích lũy", "CPA hệ 4", "CPA hệ 10", "Xếp loại"],
        rows: people.map((person) => {
          const standing = computeStanding(person.id, buildTranscript([...(termsOf.get(person.id)?.values() ?? [])]));
          return [
            formatStudentCode(person.code),
            person.fullName,
            person.className,
            person.faculty,
            standing.earnedCredits,
            decimal(standing.cpa4),
            decimal(standing.cpa10),
            standing.earnedCredits > 0 ? STANDING_LABEL[standing.standing] : "Chưa có điểm",
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
      const rows = await db
        .select({ ...studentColumns, language: graduationRecords.languageCertificate, it: graduationRecords.itCertificate, tuitionCleared: graduationRecords.tuitionCleared, disciplineFree: graduationRecords.disciplineFree, status: graduationRecords.status })
        .from(graduationRecords)
        .innerJoin(students, eq(students.id, graduationRecords.studentId))
        .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
        .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
        .innerJoin(faculties, eq(faculties.id, majors.facultyId))
        .where(byFaculty)
        .orderBy(faculties.name, administrativeClasses.code, students.code);
      return {
        header: ["MSSV", "Họ và tên", "Lớp", "Khoa", "Chứng chỉ ngoại ngữ", "Chứng chỉ tin học", "Hoàn thành học phí", "Không bị kỷ luật", "Trạng thái hồ sơ"],
        rows: rows.map((row) => [
          formatStudentCode(row.code),
          row.fullName,
          row.className,
          row.faculty,
          row.language ?? "Chưa nộp",
          row.it ?? "Chưa nộp",
          row.tuitionCleared ? "Đã hoàn thành" : "Còn nợ",
          row.disciplineFree ? "Đạt" : "Đang bị kỷ luật",
          GRADUATION_RECORD_LABEL[row.status],
        ]),
      };
    }
    default:
      return null;
  }
}
