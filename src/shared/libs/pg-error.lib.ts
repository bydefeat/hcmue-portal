import postgres from "postgres";

export const PG_ERROR = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  NOT_NULL_VIOLATION: "23502",
  EXCLUSION_VIOLATION: "23P01",
  RESTRICT_VIOLATION: "23001",
  STRING_DATA_RIGHT_TRUNCATION: "22001",
  NUMERIC_VALUE_OUT_OF_RANGE: "22003",
  INVALID_DATETIME_FORMAT: "22007",
  DATETIME_FIELD_OVERFLOW: "22008",
  DIVISION_BY_ZERO: "22012",
  INVALID_TEXT_REPRESENTATION: "22P02",
  INVALID_PARAMETER_VALUE: "22023",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
  LOCK_NOT_AVAILABLE: "55P03",
  QUERY_CANCELED: "57014",
  ADMIN_SHUTDOWN: "57P01",
  CRASH_SHUTDOWN: "57P02",
  CANNOT_CONNECT_NOW: "57P03",
  TOO_MANY_CONNECTIONS: "53300",
  CONNECTION_EXCEPTION: "08000",
  CONNECTION_DOES_NOT_EXIST: "08003",
  CONNECTION_FAILURE: "08006",
  INSUFFICIENT_PRIVILEGE: "42501",
  UNDEFINED_TABLE: "42P01",
  UNDEFINED_COLUMN: "42703",
  RAISE_EXCEPTION: "P0001",
} as const;

export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR];

export type PgError = postgres.PostgresError;

const RETRYABLE = new Set<string>([
  PG_ERROR.SERIALIZATION_FAILURE,
  PG_ERROR.DEADLOCK_DETECTED,
  PG_ERROR.LOCK_NOT_AVAILABLE,
  PG_ERROR.ADMIN_SHUTDOWN,
  PG_ERROR.CANNOT_CONNECT_NOW,
  PG_ERROR.CONNECTION_FAILURE,
]);

const GENERIC_MESSAGE: Partial<Record<string, string>> = {
  [PG_ERROR.UNIQUE_VIOLATION]: "Dữ liệu này đã tồn tại.",
  [PG_ERROR.FOREIGN_KEY_VIOLATION]: "Dữ liệu đang được nơi khác sử dụng hoặc tham chiếu tới dữ liệu không tồn tại.",
  [PG_ERROR.CHECK_VIOLATION]: "Dữ liệu không hợp lệ theo quy định.",
  [PG_ERROR.NOT_NULL_VIOLATION]: "Thiếu thông tin bắt buộc.",
  [PG_ERROR.EXCLUSION_VIOLATION]: "Bị trùng với dữ liệu đã có.",
  [PG_ERROR.STRING_DATA_RIGHT_TRUNCATION]: "Nội dung quá dài.",
  [PG_ERROR.NUMERIC_VALUE_OUT_OF_RANGE]: "Giá trị số vượt giới hạn cho phép.",
  [PG_ERROR.INVALID_TEXT_REPRESENTATION]: "Định dạng dữ liệu không hợp lệ.",
  [PG_ERROR.SERIALIZATION_FAILURE]: "Nhiều người thao tác cùng lúc, hãy thử lại.",
  [PG_ERROR.DEADLOCK_DETECTED]: "Nhiều người thao tác cùng lúc, hãy thử lại.",
  [PG_ERROR.LOCK_NOT_AVAILABLE]: "Dữ liệu đang được người khác cập nhật, hãy thử lại.",
  [PG_ERROR.QUERY_CANCELED]: "Thao tác mất quá nhiều thời gian và đã bị dừng.",
  [PG_ERROR.TOO_MANY_CONNECTIONS]: "Hệ thống đang quá tải, hãy thử lại sau ít phút.",
};

const FALLBACK_MESSAGE = "Không lưu được dữ liệu. Thử lại, nếu vẫn lỗi hãy báo Phòng Đào tạo.";

export function getPgError(error: unknown): PgError | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof postgres.PostgresError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function isPgError(error: unknown, code?: PgErrorCode): boolean {
  const pgError = getPgError(error);
  return pgError !== null && (code === undefined || pgError.code === code);
}

export function isRetryablePgError(error: unknown): boolean {
  const pgError = getPgError(error);
  return pgError !== null && (RETRYABLE.has(pgError.code) || pgError.code.startsWith("08"));
}

export function pgErrorMessage(error: unknown, constraintMessages: Partial<Record<string, string>> = {}): string {
  const pgError = getPgError(error);
  if (!pgError) return FALLBACK_MESSAGE;
  const byConstraint = pgError.constraint_name ? constraintMessages[pgError.constraint_name] : undefined;
  if (byConstraint) return byConstraint;
  if (pgError.code === PG_ERROR.RAISE_EXCEPTION || (pgError.code === PG_ERROR.CHECK_VIOLATION && !pgError.constraint_name)) return pgError.message;
  return GENERIC_MESSAGE[pgError.code] ?? FALLBACK_MESSAGE;
}

export async function withRetry<T>(run: () => Promise<T>, { attempts = 3, baseDelayMs = 40 } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isRetryablePgError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs));
    }
  }
}
