import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";

export const user = pgTable("user", {
  id: primaryId(),
  name: text().notNull(),
  email: text().notNull().unique("user_email_unique"),
  // Plugin username của better-auth: tên đăng nhập là mã số. Sinh viên lưu MSSV 10 chữ số (hiển thị có dấu chấm),
  // giảng viên và cán bộ lưu mã hồ sơ chữ thường (hiển thị chữ hoa, ví dụ GV104011).
  username: text().unique("user_username_unique"),
  displayUsername: text(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: text(),
  banned: boolean().notNull().default(false),
  banReason: text(),
  banExpires: timestamp({ withTimezone: true }),
  // Lần tạo phiên gần nhất; trống nghĩa là tài khoản được cấp nhưng chưa từng đăng nhập (chưa kích hoạt).
  lastSignInAt: timestamp({ withTimezone: true }),
  ...timestamps(),
});

export const session = pgTable(
  "session",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text().notNull().unique("session_token_unique"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    impersonatedBy: uuid().references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [index().on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps(),
  },
  (table) => [index().on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: primaryId(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index().on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: primaryId(),
  key: text().notNull().unique("rate_limit_key_unique"),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

// Đếm lần đăng nhập theo tên đăng nhập đã chuẩn hoá, vì rate limit của better-auth chỉ theo IP. Không nối khóa ngoài tới user:
// tên không tồn tại cũng được đếm và khóa tạm như thường để câu báo không lộ tài khoản nào có thật.
export const signInFailures = pgTable(
  "sign_in_failures",
  {
    username: text().primaryKey(),
    failures: integer().notNull(),
    windowStartedAt: timestamp({ withTimezone: true }).notNull(),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (table) => [index().on(table.windowStartedAt)],
);
