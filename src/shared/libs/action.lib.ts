import "server-only";
import type { z } from "zod";
import { getPgError, pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { UploadRejectedError } from "@/shared/libs/virus-scan.lib";

// Kết quả chung của mọi server action. Lỗi nghiệp vụ trả về để form hiện, không throw ra client.
export type ActionResult<T = void> = { ok: true; data: T } | ActionFailure;

export type ActionFailure = { ok: false; message: string; fieldErrors?: Record<string, string> };

export function actionOk(): ActionResult;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function actionError(message: string, fieldErrors?: Record<string, string>): ActionFailure {
  return { ok: false, message, fieldErrors };
}

// Dữ liệu từ client không tin được: luôn parse lại trên server dù form đã kiểm.
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): { ok: true; data: z.output<S> } | ActionFailure {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.join(".");
    fieldErrors[field] ??= issue.message;
  }
  return actionError("Dữ liệu chưa hợp lệ, kiểm tra lại các ô được đánh dấu.", fieldErrors);
}

// Bắt lỗi DB trong action: lỗi Postgres đổi thành câu tiếng Việt, lỗi lạ ghi log. Chỉ bọc lệnh DB trong try,
// kiểm quyền (forbidden, redirect) đặt trước try để Next xử lý. Tệp tải lên bị từ chối khi quét virus (withStoredFiles) thì
// trả nguyên câu báo cho người dùng.
export function actionFailure(error: unknown, constraintMessages: Partial<Record<string, string>> = {}): ActionFailure {
  if (error instanceof UploadRejectedError) return actionError(error.message);
  if (!getPgError(error)) console.error(error);
  return actionError(pgErrorMessage(error, constraintMessages));
}
