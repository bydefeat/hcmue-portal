import type { RoleScope } from "@/modules/access/access.type";
import type { roleScopeEnum } from "@/modules/access/access.schema";
import type { AppointmentMode, AppointmentStatus } from "@/modules/advising/advising.type";
import type { appointmentModeEnum, appointmentStatusEnum } from "@/modules/advising/advising.schema";
import type { AnnouncementCategory, AnnouncementStatus } from "@/modules/announcements/announcements.type";
import type { announcementCategoryEnum, announcementStatusEnum } from "@/modules/announcements/announcements.schema";
import type { AuditAction, AuditEntityType } from "@/modules/audit/audit.type";
import type { auditActionEnum, auditEntityTypeEnum } from "@/modules/audit/audit.schema";
import type { ClassSectionStatus, HoldKind, RegistrationEventKind } from "@/modules/course-registration/course-registration.type";
import type { classSectionStatusEnum, holdKindEnum, registrationEventKindEnum } from "@/modules/course-registration/course-registration.schema";
import type { CourseType, KnowledgeBlock, ProgramStatus } from "@/modules/curriculum/curriculum.type";
import type { courseTypeEnum, knowledgeBlockEnum, programStatusEnum } from "@/modules/curriculum/curriculum.schema";
import type { ExamFormat, ExamKind, ExamPaperStatus, ExamSessionStatus } from "@/modules/exams/exams.type";
import type { examFormatEnum, examKindEnum, examPaperStatusEnum, examSessionStatusEnum } from "@/modules/exams/exams.schema";
import type { RoomStatus, RoomType } from "@/modules/facilities/facilities.type";
import type { roomStatusEnum, roomTypeEnum } from "@/modules/facilities/facilities.schema";
import type { GradeSheetStatus, WarningStatus } from "@/modules/grades/grades.type";
import type { gradeSheetStatusEnum, warningStatusEnum } from "@/modules/grades/grades.schema";
import type { NotificationAudience, NotificationKind } from "@/modules/notifications/notifications.type";
import type { notificationAudienceEnum, notificationKindEnum } from "@/modules/notifications/notifications.schema";
import type { RequestKind, StepRole, StepStatus } from "@/modules/requests/requests.type";
import type { requestKindEnum, stepRoleEnum, stepStatusEnum } from "@/modules/requests/requests.schema";
import type { AttendanceStatus } from "@/modules/schedule/schedule.type";
import type { attendanceStatusEnum } from "@/modules/schedule/schedule.schema";
import type { CalendarEventKind } from "@/modules/settings/settings.type";
import type { calendarEventKindEnum } from "@/modules/settings/settings.schema";
import type { StudyPlanStatus } from "@/modules/study-plan/study-plan.type";
import type { studyPlanStatusEnum } from "@/modules/study-plan/study-plan.schema";
import type { ClassAnnouncementStatus, SyllabusStatus } from "@/modules/teaching/teaching.type";
import type { classAnnouncementStatusEnum, syllabusStatusEnum } from "@/modules/teaching/teaching.schema";
import type { DecisionKind, DecisionStatus, LecturerStatus, StudentStatus } from "@/modules/users/users.type";
import type { decisionKindEnum, decisionStatusEnum, genderEnum, lecturerStatusEnum, studentStatusEnum } from "@/modules/users/users.schema";
import type { MockGender } from "@/shared/libs/mock.lib";

type Values<T extends { enumValues: readonly string[] }> = T["enumValues"][number];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type SchemaMatchesFrontendTypes = [
  Assert<Same<Values<typeof roleScopeEnum>, RoleScope>>,
  Assert<Same<Values<typeof appointmentModeEnum>, AppointmentMode>>,
  Assert<Same<Values<typeof appointmentStatusEnum>, AppointmentStatus>>,
  Assert<Same<Values<typeof announcementCategoryEnum>, AnnouncementCategory>>,
  Assert<Same<Values<typeof announcementStatusEnum>, AnnouncementStatus>>,
  Assert<Same<Values<typeof auditActionEnum>, AuditAction>>,
  Assert<Same<Values<typeof auditEntityTypeEnum>, AuditEntityType>>,
  Assert<Same<Values<typeof classSectionStatusEnum>, ClassSectionStatus>>,
  Assert<Same<Values<typeof holdKindEnum>, HoldKind>>,
  Assert<Same<Values<typeof registrationEventKindEnum>, RegistrationEventKind>>,
  Assert<Same<Values<typeof courseTypeEnum>, CourseType>>,
  Assert<Same<Values<typeof knowledgeBlockEnum>, KnowledgeBlock>>,
  Assert<Same<Values<typeof programStatusEnum>, ProgramStatus>>,
  Assert<Same<Values<typeof examFormatEnum>, ExamFormat>>,
  Assert<Same<Values<typeof examKindEnum>, ExamKind>>,
  Assert<Same<Values<typeof examPaperStatusEnum>, ExamPaperStatus>>,
  Assert<Same<Values<typeof examSessionStatusEnum>, ExamSessionStatus>>,
  Assert<Same<Values<typeof roomStatusEnum>, RoomStatus>>,
  Assert<Same<Values<typeof roomTypeEnum>, RoomType>>,
  Assert<Same<Values<typeof gradeSheetStatusEnum>, GradeSheetStatus>>,
  Assert<Same<Values<typeof warningStatusEnum>, WarningStatus>>,
  Assert<Same<Values<typeof notificationKindEnum>, NotificationKind>>,
  Assert<Same<Values<typeof notificationAudienceEnum>, NotificationAudience>>,
  Assert<Same<Values<typeof requestKindEnum>, RequestKind>>,
  Assert<Same<Values<typeof stepRoleEnum>, StepRole>>,
  Assert<Same<Values<typeof stepStatusEnum>, StepStatus>>,
  Assert<Same<Values<typeof attendanceStatusEnum>, AttendanceStatus>>,
  Assert<Same<Values<typeof calendarEventKindEnum>, CalendarEventKind>>,
  Assert<Same<Values<typeof studyPlanStatusEnum>, StudyPlanStatus>>,
  Assert<Same<Values<typeof classAnnouncementStatusEnum>, ClassAnnouncementStatus>>,
  Assert<Same<Values<typeof syllabusStatusEnum>, SyllabusStatus>>,
  Assert<Same<Values<typeof decisionKindEnum>, DecisionKind>>,
  Assert<Same<Values<typeof decisionStatusEnum>, DecisionStatus>>,
  Assert<Same<Values<typeof lecturerStatusEnum>, LecturerStatus>>,
  Assert<Same<Values<typeof studentStatusEnum>, StudentStatus>>,
  Assert<Same<Values<typeof genderEnum>, MockGender>>,
];
