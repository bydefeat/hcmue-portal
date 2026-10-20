"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { db } from "@/shared/libs/db.lib";
import { schoolToday } from "@/shared/libs/date.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission, requireSchoolWidePermission } from "@/modules/access/access.query";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { auditChanges } from "@/modules/audit/audit.rule";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { GRADUATION_CONSTRAINT_MESSAGE } from "@/modules/graduation/graduation.constant";
import { loadGraduationCandidates, openGraduationRound } from "@/modules/graduation/graduation.lib";
import { graduationWorkbook, XLSX_MIME } from "@/modules/graduation/graduation.excel";
import {
  GRADUATION_APPROVE_SCHEMA,
  GRADUATION_CERTIFICATES_SCHEMA,
  GRADUATION_EXPORT_SCHEMA,
  GRADUATION_ROUND_SCHEMA,
  type GraduationCertificatesInput,
  type GraduationRoundInput,
} from "@/modules/graduation/graduation.rule";
import { graduationRecords, graduationRounds } from "@/modules/graduation/graduation.schema";
import type { GraduationCandidate, GraduationRound } from "@/modules/graduation/graduation.type";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { administrativeClasses, studentDecisions, students } from "@/modules/users/users.schema";

class GraduationActionError extends Error {}

function failure(error: unknown) {
  if (error instanceof GraduationActionError) return actionError(error.message);
  return actionFailure(error, GRADUATION_CONSTRAINT_MESSAGE);
}

function revalidateGraduation() {
  revalidatePath("/administrator/graduation");
  revalidatePath("/administrator/reports");
}

// Hội đồng công nhận: chỉ sinh viên đủ mọi điều kiện (đánh giá lại trên server), mỗi người một dự thảo quyết định công nhận tốt nghiệp
// kèm hạng tốt nghiệp đã xét giảm hạng; ghi nhật ký từng hồ sơ.
export async function approveGraduation(studentIds: string[]): Promise<ActionResult<{ studentIds: string[] }>> {
  const viewer = await requirePermission("graduation.manage");
  const parsed = parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds });
  if (!parsed.ok) return parsed;
  const chosen = new Set(parsed.data.studentIds);
  const { round, candidates } = await loadGraduationCandidates(viewer);
  if (!round) return actionError("Chưa mở đợt xét tốt nghiệp nào, tải lại trang.");
  const eligible = candidates.filter((candidate) => chosen.has(candidate.studentId) && candidate.status === "eligible");
  if (eligible.length === 0) return actionError("Không có sinh viên nào đủ điều kiện trong danh sách đã chọn, tải lại trang.");
  const decidedAt = new Date();
  try {
    const approved = await db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const candidate of eligible) {
        const [decision] = await tx
          .insert(studentDecisions)
          .values({
            kind: "graduate",
            studentId: candidate.studentId,
            title: `Công nhận tốt nghiệp ${round.name}, hạng ${candidate.classification}`,
            basis: `Kết quả xét tốt nghiệp của Hội đồng: CPA ${candidate.cpa4?.toFixed(2).replace(".", ",")}, ${candidate.earnedCredits} tín chỉ${candidate.downgradeReasons.length > 0 ? `; giảm hạng: ${candidate.downgradeReasons.join("; ")}` : ""}`,
            effectiveDate: schoolToday(),
          })
          .returning({ id: studentDecisions.id });
        const [record] = await tx
          .insert(graduationRecords)
          .values({ studentId: candidate.studentId, status: "approved", decidedAt, decidedByUserId: viewer.id, decisionId: decision.id, roundId: round.id })
          .onConflictDoUpdate({
            target: graduationRecords.studentId,
            set: { status: "approved", decidedAt, decidedByUserId: viewer.id, decisionId: decision.id, roundId: round.id, updatedAt: sql`now()` },
            setWhere: eq(graduationRecords.status, "pending"),
          })
          .returning({ id: graduationRecords.id, studentId: graduationRecords.studentId });
        // Người khác vừa công nhận trước: hủy cả lượt để không sinh quyết định thừa.
        if (!record) throw new GraduationActionError(`Hồ sơ của ${candidate.fullName} vừa được xử lý, tải lại trang.`);
        await recordAudit(tx, {
          actor: auditActorOf(viewer),
          action: "approve",
          entityType: "graduation",
          entityId: record.id,
          entityLabel: `${candidate.fullName} (${candidate.code})`,
          summary: `Hội đồng công nhận tốt nghiệp ${round.name}, hạng ${candidate.classification}`,
          changes: candidate.downgradeReasons.length > 0 ? [{ field: "Giảm hạng", before: candidate.baseRank ? candidate.classification : "", after: candidate.downgradeReasons.join("; ") }] : [],
        });
        ids.push(record.studentId);
      }
      return ids;
    });
    revalidateGraduation();
    revalidatePath("/administrator/decisions");
    return actionOk({ studentIds: approved });
  } catch (error) {
    return failure(error);
  }
}

// Xuất .xlsx đúng danh sách đang lọc trên trang (theo thứ tự đang hiện); điều kiện đánh giá lại trên server trong phạm vi người xem.
export async function exportGraduationCandidates(studentIds: string[]): Promise<ActionResult<{ fileName: string; base64: string; mimeType: string }>> {
  const viewer = await requirePermission("graduation.manage");
  const parsed = parseInput(GRADUATION_EXPORT_SCHEMA, { studentIds });
  if (!parsed.ok) return parsed;
  const candidates = new Map((await loadGraduationCandidates(viewer)).candidates.map((candidate) => [candidate.studentId, candidate]));
  const rows = parsed.data.studentIds.flatMap((id) => candidates.get(id) ?? []);
  if (rows.length === 0) return actionError("Không có sinh viên nào trong danh sách để xuất, tải lại trang.");
  const buffer = await graduationWorkbook(rows);
  return actionOk({ fileName: `xet-tot-nghiep-${schoolToday().replaceAll("-", "")}.xlsx`, base64: buffer.toString("base64"), mimeType: XLSX_MIME });
}

// Mở đợt xét mới hoặc sửa tên, khóa của đợt đang mở (dữ liệu chung toàn trường). Chỉ một đợt mở một lúc (graduation_rounds_single_open).
export async function saveGraduationRound(input: GraduationRoundInput): Promise<ActionResult<GraduationRound>> {
  const viewer = await requireSchoolWidePermission("graduation.manage");
  const parsed = parseInput(GRADUATION_ROUND_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { name, cohorts } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const current = await openGraduationRound(tx);
      const [row] = current
        ? await tx.update(graduationRounds).set({ name, cohorts }).where(eq(graduationRounds.id, current.id)).returning({ id: graduationRounds.id })
        : await tx.insert(graduationRounds).values({ name, cohorts, createdByUserId: viewer.id }).returning({ id: graduationRounds.id });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: current ? "update" : "create",
        entityType: "graduation",
        entityId: row.id,
        entityLabel: name,
        summary: current ? "Sửa đợt xét tốt nghiệp đang mở" : `Mở đợt xét tốt nghiệp cho khóa ${cohorts.join(", ")}`,
        changes: current
          ? auditChanges([
              ["Tên đợt", current.name, name],
              ["Khóa xét", current.cohorts.join(", "), cohorts.join(", ")],
            ])
          : [],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidateGraduation();
  const round = await openGraduationRound();
  return round ? actionOk(round) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Đóng đợt xét đang mở: trang xét tốt nghiệp không còn danh sách cho tới khi mở đợt mới; hồ sơ đã công nhận giữ nguyên.
export async function closeGraduationRound(): Promise<ActionResult<null>> {
  const viewer = await requireSchoolWidePermission("graduation.manage");
  try {
    const closed = await db.transaction(async (tx) => {
      const current = await openGraduationRound(tx);
      if (!current) return false;
      await tx.update(graduationRounds).set({ isOpen: false }).where(eq(graduationRounds.id, current.id));
      await recordAudit(tx, { actor: auditActorOf(viewer), action: "lock", entityType: "graduation", entityId: current.id, entityLabel: current.name, summary: "Đóng đợt xét tốt nghiệp" });
      return true;
    });
    if (!closed) return actionError("Không có đợt xét nào đang mở, tải lại trang.");
  } catch (error) {
    return failure(error);
  }
  revalidateGraduation();
  return actionOk(null);
}

// Phòng Đào tạo nhập, xác nhận chứng chỉ ngoại ngữ (kèm bậc) và tin học vào hồ sơ xét tốt nghiệp của sinh viên trong phạm vi khoa.
// Hồ sơ đã công nhận hoặc đã tốt nghiệp không sửa nữa.
export async function saveGraduationCertificates(input: GraduationCertificatesInput): Promise<ActionResult<GraduationCandidate | null>> {
  const viewer = await requirePermission("graduation.manage");
  const parsed = parseInput(GRADUATION_CERTIFICATES_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { studentId, languageCertificate, languageLevel, itCertificate } = parsed.data;
  const [student] = await db
    .select({ code: students.code, fullName: students.fullName, faculty: faculties.name })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(students.id, studentId));
  if (!student) return actionError("Không tìm thấy sinh viên, tải lại trang.");
  if (!inScope(viewer, student.faculty)) forbidden();
  const verifiedAt = new Date();
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(graduationRecords).where(eq(graduationRecords.studentId, studentId)).for("update");
      if (before && before.status !== "pending") throw new GraduationActionError("Hồ sơ đã được hội đồng công nhận, không sửa chứng chỉ được nữa.");
      const values = { languageCertificate, languageLevel, itCertificate, certificatesVerifiedAt: verifiedAt, certificatesVerifiedByUserId: viewer.id };
      const [row] = before
        ? await tx.update(graduationRecords).set(values).where(eq(graduationRecords.id, before.id)).returning({ id: graduationRecords.id })
        : await tx.insert(graduationRecords).values({ studentId, ...values }).returning({ id: graduationRecords.id });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "update",
        entityType: "graduation",
        entityId: row.id,
        entityLabel: `${student.fullName} (${formatStudentCode(student.code)})`,
        summary: "Xác nhận chứng chỉ trong hồ sơ xét tốt nghiệp",
        changes: auditChanges([
          ["Chứng chỉ ngoại ngữ", before?.languageCertificate, languageCertificate],
          ["Bậc ngoại ngữ", before?.languageLevel, languageLevel],
          ["Chứng chỉ tin học", before?.itCertificate, itCertificate],
        ]),
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidateGraduation();
  // Trả lại kết quả xét mới của sinh viên để bảng cập nhật ngay.
  const { candidates } = await loadGraduationCandidates(viewer);
  return actionOk(candidates.find((candidate) => candidate.studentId === studentId) ?? null);
}
