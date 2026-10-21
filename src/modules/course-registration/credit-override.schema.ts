import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/shared/libs/db-column.lib";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { academicRequests } from "@/modules/requests/requests.schema";
import { students } from "@/modules/users/users.schema";

export const creditOverrides = pgTable(
  "credit_overrides",
  {
    id: primaryId(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    maxCredits: smallint().notNull(),
    requestId: uuid().references(() => academicRequests.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("credit_overrides_term_id_student_id_unique").on(table.termId, table.studentId),
    index().on(table.studentId),
    index().on(table.requestId),
    check("credit_overrides_max_credits_range", sql`${table.maxCredits} BETWEEN 1 AND 60`),
  ],
);
