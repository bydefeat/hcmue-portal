import "server-only";
import { and, eq, inArray, isNull, ne, notExists, notLike, sql } from "drizzle-orm";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { studentDecisions } from "@/modules/users/users.schema";
import { reserveTermsOf } from "@/modules/requests/requests.rule";
import { academicRequests, requestSteps } from "@/modules/requests/requests.schema";

type Executor = Transaction | typeof db;

// Số học kỳ bảo lưu sinh viên đã dùng: đơn bảo lưu đã duyệt (theo thời gian xin trong đơn), cộng đơn đang xử lý nếu xét lúc gửi đơn
// (để không gửi chồng nhiều đơn vượt quy chế), cộng quyết định bảo lưu lập tay (không từ đơn) đã ký, mỗi quyết định tính một học kỳ.
// Dùng chung cho lúc gửi đơn (requests.action) và lúc duyệt đơn (users.request-effects).
export async function reserveTermsUsed(executor: Executor, studentId: string, options: { excludeRequestId?: string; includeInFlight: boolean }) {
  const rejected = executor
    .select({ id: requestSteps.id })
    .from(requestSteps)
    .where(and(eq(requestSteps.requestId, academicRequests.id), eq(requestSteps.status, "rejected")));
  const unfinished = executor
    .select({ id: requestSteps.id })
    .from(requestSteps)
    .where(and(eq(requestSteps.requestId, academicRequests.id), inArray(requestSteps.status, ["waiting", "pending"])));
  const [requests, manual] = await Promise.all([
    executor
      .select({ details: academicRequests.details })
      .from(academicRequests)
      .where(
        and(
          eq(academicRequests.kind, "reserve"),
          eq(academicRequests.requesterStudentId, studentId),
          isNull(academicRequests.cancelledAt),
          notExists(rejected),
          options.includeInFlight ? undefined : notExists(unfinished),
          options.excludeRequestId ? ne(academicRequests.id, options.excludeRequestId) : undefined,
        ),
      ),
    executor
      .select({ total: sql<number>`count(*)::int` })
      .from(studentDecisions)
      .where(
        and(
          eq(studentDecisions.studentId, studentId),
          eq(studentDecisions.kind, "reserve"),
          eq(studentDecisions.status, "signed"),
          // Quyết định lập từ đơn ghi mã đơn ở phần căn cứ, đã tính theo đơn ở trên.
          notLike(studentDecisions.basis, "%DT-____-_____%"),
        ),
      ),
  ]);
  return requests.reduce((sum, request) => sum + (reserveTermsOf(request.details) ?? 1), 0) + (manual[0]?.total ?? 0);
}
