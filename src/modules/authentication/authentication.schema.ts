import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../shared/libs/db-column.lib";

export const user = pgTable("user", {
  id: primaryId(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: text(),
  banned: boolean().notNull().default(false),
  banReason: text(),
  banExpires: timestamp({ withTimezone: true }),
  ...timestamps(),
});

export const session = pgTable(
  "session",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
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
