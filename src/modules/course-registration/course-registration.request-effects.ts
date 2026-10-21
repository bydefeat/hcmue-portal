import "server-only";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { InputError } from "@/shared/libs/action.lib";
import type { Transaction } from "@/shared/libs/db.lib";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { recordAudit } from "@/modules/audit/audit.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSectionAudienceMajors, classSections, terms } from "@/modules/course-registration/course-registration.schema";
import { creditOverrides } from "@/modules/course-registration/credit-override.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { notifyStudents, notifyUsers } from "@/modules/notifications/notifications.lib";
import type { ApprovedRequest, RequestApprovedHandler } from "@/modules/requests/requests.lib";
import { academicRequests } from "@/modules/requests/requests.schema";
import { openClassCourseCode, openClassPeersOf, overloadCreditsOf } from "@/modules/requests/requests.rule";
import { regulationAt } from "@/modules/settings/settings.lib";

async function targetTermOf(tx: Transaction) {
  const rows = await tx
    .select({ id: terms.id, name: terms.name, shortName: terms.shortName, startDate: terms.startDate, endDate: terms.endDate, isTarget: terms.isRegistrationTarget })
    .from(terms)
    .where(or(eq(terms.isRegistrationTarget, true), eq(terms.isCurrent, true)));
  const term = rows.find((row) => row.isTarget) ?? rows[0];
  if (!term) throw new InputError("Chưa đặt học kỳ hiện tại hay học kỳ đăng ký, chưa ghi được kết quả đơn. Đặt ở trang Học kỳ trước.");
  return term;
}

function studentOf(request: ApprovedRequest) {
  if (!request.requesterStudentId) throw new InputError("Đơn không có sinh viên gửi, không ghi được kết quả.");
  return request.requesterStudentId;
}

export const approveOverload: RequestApprovedHandler = async (request, tx) => {
  const studentId = studentOf(request);
  const credits = overloadCreditsOf(request.details);
  if (credits === null) throw new InputError("Đơn không ghi số tín chỉ xin đăng ký, không nâng được hạn mức. Từ chối đơn để sinh viên gửi lại.");
  const regulation = await regulationAt(tx);
  const max = regulation.credits.maxPerTerm + regulation.credits.overloadExtraCredits;
  if (credits > max) throw new InputError(`Quy chế cho học vượt tối đa ${max} tín chỉ mỗi học kỳ, đơn xin ${credits} tín chỉ.`);
  if (credits <= regulation.credits.maxPerTerm) throw new InputError(`Đơn xin ${credits} tín chỉ, không vượt hạn mức ${regulation.credits.maxPerTerm} tín chỉ nên không cần duyệt học vượt.`);
  const term = await targetTermOf(tx);
  await tx
    .insert(creditOverrides)
    .values({ termId: term.id, studentId, maxCredits: credits, requestId: request.id })
    .onConflictDoUpdate({ target: [creditOverrides.termId, creditOverrides.studentId], set: { maxCredits: credits, requestId: request.id, createdAt: new Date() } });
  await recordAudit(tx, {
    actor: request.actor,
    action: "update",
    entityType: "student",
    entityId: studentId,
    entityLabel: request.code,
    summary: `Duyệt học vượt theo đơn ${request.code}: ${term.shortName} đăng ký tối đa ${credits} tín chỉ`,
    changes: [{ field: "Tín chỉ tối đa", before: String(regulation.credits.maxPerTerm), after: String(credits) }],
  });
  await notifyStudents(tx, [studentId], {
    kind: "request",
    title: `Được học vượt ${credits} tín chỉ ${term.shortName}`,
    body: `Đơn ${request.code} đã duyệt: ${term.name} bạn đăng ký được tối đa ${credits} tín chỉ.`,
    href: "/application/registration",
  });
};

async function classSectionManagers(tx: Transaction, facultyId: string) {
  const rows = await tx
    .selectDistinct({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, roles.id), eq(rolePermissions.permission, "class-sections.manage")))
    .innerJoin(user, eq(user.id, roleAssignments.userId))
    .where(and(or(eq(roles.scope, "university"), eq(roleAssignments.facultyId, facultyId)), sql`',' || ${user.role} || ',' LIKE '%,admin,%'`));
  return rows.map((row) => row.userId);
}

const DEFAULT_CAPACITY = 40;

export const approveOpenClass: RequestApprovedHandler = async (request, tx) => {
  studentOf(request);
  const [row] = await tx.select({ subject: academicRequests.subject }).from(academicRequests).where(eq(academicRequests.id, request.id));
  const code = openClassCourseCode(request.details, row?.subject ?? "");
  if (!code) throw new InputError("Đơn không ghi mã học phần (dạng COMP1031), chưa mở lớp tự động được. Từ chối đơn để sinh viên gửi lại đúng mã.");
  const [course] = await tx.select({ id: courses.id, code: courses.code, name: courses.name, isActive: courses.isActive, facultyId: courses.facultyId }).from(courses).where(eq(courses.code, code));
  if (!course) throw new InputError(`Không có học phần ${code} trong danh mục, chưa mở lớp được.`);
  if (!course.isActive) throw new InputError(`Học phần ${code} đã ngừng giảng dạy, không mở lớp được.`);
  const term = await targetTermOf(tx);
  const [origin] = await tx
    .select()
    .from(classSections)
    .where(and(eq(classSections.termId, term.id), eq(classSections.courseId, course.id), ne(classSections.status, "cancelled")))
    .orderBy(desc(classSections.sectionNumber))
    .limit(1);
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${classSections.sectionNumber}), 0) + 1` })
    .from(classSections)
    .where(and(eq(classSections.termId, term.id), eq(classSections.courseId, course.id)));
  const sectionCode = `${course.code}.${String(next).padStart(2, "0")}`;
  const peers = openClassPeersOf(request.details) ?? 0;
  const [created] = await tx
    .insert(classSections)
    .values({
      termId: term.id,
      courseId: course.id,
      sectionNumber: next,
      code: sectionCode,
      capacity: origin?.capacity ?? Math.min(200, Math.max(DEFAULT_CAPACITY, peers)),
      minEnrollment: origin?.minEnrollment ?? 0,
      status: "draft",
      startDate: origin?.startDate ?? term.startDate,
      endDate: origin?.endDate ?? term.endDate,
      audienceCohorts: origin?.audienceCohorts ?? null,
      audienceNote: origin?.audienceNote ?? `Mở theo đơn ${request.code}`,
    })
    .returning({ id: classSections.id });
  if (origin) {
    const audience = await tx.select({ majorId: classSectionAudienceMajors.majorId }).from(classSectionAudienceMajors).where(eq(classSectionAudienceMajors.classSectionId, origin.id));
    if (audience.length > 0) await tx.insert(classSectionAudienceMajors).values(audience.map((entry) => ({ classSectionId: created.id, majorId: entry.majorId })));
  }
  await recordAudit(tx, {
    actor: request.actor,
    action: "create",
    entityType: "class-section",
    entityId: created.id,
    entityLabel: sectionCode,
    summary: `Mở lớp nháp ${sectionCode} theo đơn ${request.code}${peers > 0 ? ` (${peers} sinh viên đề nghị)` : ""}`,
  });
  await notifyUsers(tx, await classSectionManagers(tx, course.facultyId), "administrator", {
    kind: "request",
    title: `Lớp nháp ${sectionCode} chờ xếp lịch`,
    body: `Đơn ${request.code} xin mở lớp ${course.code} ${course.name} đã duyệt${peers > 0 ? `, ${peers} sinh viên đề nghị` : ""}. Xếp lịch, phòng, giảng viên rồi mở đăng ký ${term.shortName}.`,
    href: "/administrator/class-sections",
  });
};

export const REGISTRATION_REQUEST_EFFECTS = { overload: approveOverload, "open-class": approveOpenClass } as const;
