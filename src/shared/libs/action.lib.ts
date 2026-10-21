import "server-only";
import type { z } from "zod";
import { getPgError, pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { UploadRejectedError } from "@/shared/libs/virus-scan.lib";

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

export class InputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export function actionFailure(error: unknown, constraintMessages: Partial<Record<string, string>> = {}): ActionFailure {
  if (error instanceof UploadRejectedError) return actionError(error.message);
  if (error instanceof InputError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  if (!getPgError(error)) console.error(error);
  return actionError(pgErrorMessage(error, constraintMessages));
}
