import { z } from "zod";

const blankAsUnset = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === "" ? undefined : value), schema);

const schema = z.object({
  DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DEFEAT_POSTGRES_POOL_MAX: blankAsUnset(z.coerce.number().int().min(1).max(100).default(10)),
  DEFEAT_POSTGRES_STATEMENT_TIMEOUT_MS: blankAsUnset(z.coerce.number().int().min(1000).default(15000)),
  DEFEAT_DATABASE_LOG_QUERIES: blankAsUnset(z.stringbool().default(false)),
  DEFEAT_BETTER_AUTH_SESSION_SIGNING_SECRET_KEY: z.string().min(32),
  DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL: z.url({ protocol: /^https?$/ }),
  DEFEAT_BETTER_AUTH_TRUSTED_ORIGINS: blankAsUnset(
    z
      .string()
      .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
      .default([]),
  ),
  // Gửi email qua Resend. Bỏ trống khóa thì không gửi, chỉ in nội dung thư ra log server (môi trường phát triển).
  DEFEAT_RESEND_API_KEY: blankAsUnset(z.string().startsWith("re_").optional()),
  DEFEAT_MAIL_FROM: blankAsUnset(z.string().default("HCMUE Portal <onboarding@resend.dev>")),
  // Khóa bí mật của bộ hẹn giờ gọi /api/cron/<tác vụ>. Bỏ trống thì endpoint tắt.
  DEFEAT_CRON_SECRET: blankAsUnset(z.string().min(32).optional()),
  // Thư mục lưu tệp tải lên (minh chứng đơn từ, đề thi), tương đối thì tính từ thư mục chạy app.
  DEFEAT_STORAGE_DIRECTORY: blankAsUnset(z.string().trim().min(1).default("./storage")),
});

export const env = schema.parse(process.env);
