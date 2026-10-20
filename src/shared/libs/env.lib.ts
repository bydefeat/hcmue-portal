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
  // Nơi lưu tệp: "local" (thư mục trên) hoặc "s3" (AWS S3, Cloudflare R2, MinIO; cần đủ vùng, bucket, khóa truy cập).
  DEFEAT_STORAGE_DRIVER: blankAsUnset(z.enum(["local", "s3"]).default("local")),
  DEFEAT_S3_ENDPOINT: blankAsUnset(z.url({ protocol: /^https?$/ }).optional()),
  DEFEAT_S3_REGION: blankAsUnset(z.string().trim().min(1).optional()),
  DEFEAT_S3_BUCKET: blankAsUnset(
    z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, "Tên bucket chỉ gồm chữ thường, số, dấu chấm, gạch ngang, dài 3-63 ký tự")
      .optional(),
  ),
  DEFEAT_S3_ACCESS_KEY_ID: blankAsUnset(z.string().trim().min(1).optional()),
  DEFEAT_S3_SECRET_ACCESS_KEY: blankAsUnset(z.string().min(1).optional()),
  DEFEAT_S3_FORCE_PATH_STYLE: blankAsUnset(z.stringbool().default(false)),
  // Quét virus tệp tải lên bằng clamd (ClamAV) qua TCP. Bỏ trống host thì không quét.
  DEFEAT_CLAMAV_HOST: blankAsUnset(z.string().trim().min(1).optional()),
  DEFEAT_CLAMAV_PORT: blankAsUnset(z.coerce.number().int().min(1).max(65535).default(3310)),
  // Header chứa IP thật của người dùng, do reverse proxy ghi đè (rate limit đăng nhập, nhật ký thao tác).
  DEFEAT_TRUSTED_IP_HEADER: blankAsUnset(z.string().trim().toLowerCase().default("x-forwarded-for")),
  // IP hoặc dải CIDR của các reverse proxy, cách nhau bởi dấu phẩy. Bỏ trống thì chỉ tin header có đúng một IP.
  DEFEAT_TRUSTED_PROXIES: blankAsUnset(
    z
      .string()
      .transform((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean))
      .default([]),
  ),
});

const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

const S3_REQUIRED = ["DEFEAT_S3_REGION", "DEFEAT_S3_BUCKET", "DEFEAT_S3_ACCESS_KEY_ID", "DEFEAT_S3_SECRET_ACCESS_KEY"] as const;

// Production thiếu khóa Resend thì mail.lib in cả mã OTP ra log: không cho chạy (bước next build vẫn qua để dựng được bản build).
export const env = schema
  .refine((value) => process.env.NODE_ENV !== "production" || isBuildPhase() || Boolean(value.DEFEAT_RESEND_API_KEY), {
    message: "DEFEAT_RESEND_API_KEY bắt buộc khi NODE_ENV=production",
    path: ["DEFEAT_RESEND_API_KEY"],
  })
  .superRefine((value, context) => {
    if (value.DEFEAT_STORAGE_DRIVER !== "s3" || isBuildPhase()) return;
    for (const name of S3_REQUIRED) {
      if (!value[name]) context.addIssue({ code: "custom", path: [name], message: `${name} bắt buộc khi DEFEAT_STORAGE_DRIVER=s3` });
    }
  })
  .parse(process.env);
