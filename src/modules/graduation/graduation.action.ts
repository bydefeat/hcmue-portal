"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { requirePermission } from "@/modules/access/access.query";
import { GRADUATION_CONSTRAINT_MESSAGE } from "@/modules/graduation/graduation.constant";
import { loadGraduationCandidates } from "@/modules/graduation/graduation.query";
import { GRADUATION_APPROVE_SCHEMA } from "@/modules/graduation/graduation.rule";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { studentDecisions } from "@/modules/users/users.schema";

class GraduationActionError extends Error {}

// Hội đồng công nhận: chỉ sinh viên đủ mọi điều kiện (đánh giá lại trên server), mỗi người một dự thảo quyết định công nhận tốt nghiệp.
export async function approveGraduation(studentIds: string[]): Promise<ActionResult<{ studentIds: string[] }>> {
  const viewer = await requirePermission("graduation.manage");
  const parsed = parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds });
  if (!parsed.ok) return parsed;
  const chosen = new Set(parsed.data.studentIds);
  const eligible = (await loadGraduationCandidates(viewer)).filter((candidate) => chosen.has(candidate.studentId) && candidate.status === "eligible");
  if (eligible.length === 0) return actionError("Không có sinh viên nào đủ điều kiện trong danh sách đã chọn, tải lại trang.");
  const decidedAt = new Date();
  const title = `Công nhận tốt nghiệp đợt tháng 12 năm ${dayjs().year()}`;
  try {
    const approved = await db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const candidate of eligible) {
        const [decision] = await tx
          .insert(studentDecisions)
          .values({ kind: "graduate", studentId: candidate.studentId, title, basis: "Kết quả xét tốt nghiệp của Hội đồng", effectiveDate: dayjs().format("YYYY-MM-DD") })
          .returning({ id: studentDecisions.id });
        const [record] = await tx
          .insert(graduationRecords)
          .values({ studentId: candidate.studentId, status: "approved", decidedAt, decidedByUserId: viewer.id, decisionId: decision.id })
          .onConflictDoUpdate({
            target: graduationRecords.studentId,
            set: { status: "approved", decidedAt, decidedByUserId: viewer.id, decisionId: decision.id, updatedAt: sql`now()` },
            setWhere: eq(graduationRecords.status, "pending"),
          })
          .returning({ studentId: graduationRecords.studentId });
        // Người khác vừa công nhận trước: hủy cả lượt để không sinh quyết định thừa.
        if (!record) throw new GraduationActionError(`Hồ sơ của ${candidate.fullName} vừa được xử lý, tải lại trang.`);
        ids.push(record.studentId);
      }
      return ids;
    });
    revalidatePath("/administrator/graduation");
    revalidatePath("/administrator/decisions");
    return actionOk({ studentIds: approved });
  } catch (error) {
    if (error instanceof GraduationActionError) return actionError(error.message);
    return actionFailure(error, GRADUATION_CONSTRAINT_MESSAGE);
  }
}
