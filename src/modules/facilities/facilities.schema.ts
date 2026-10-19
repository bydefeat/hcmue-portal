import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, smallint, text, unique, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../shared/libs/db-column.lib";

export const roomTypeEnum = pgEnum("room_type", ["lecture", "lab", "hall", "seminar"]);
export const roomStatusEnum = pgEnum("room_status", ["active", "maintenance"]);

export const campuses = pgTable("campuses", {
  id: primaryId(),
  name: text().notNull().unique(),
  address: text().notNull(),
  ...timestamps(),
});

export const rooms = pgTable(
  "rooms",
  {
    id: primaryId(),
    campusId: uuid()
      .notNull()
      .references(() => campuses.id, { onDelete: "restrict" }),
    code: text().notNull(),
    building: text().notNull(),
    floor: smallint().notNull(),
    capacity: smallint().notNull(),
    examCapacity: smallint().notNull(),
    type: roomTypeEnum().notNull(),
    equipment: text().array().notNull().default(sql`'{}'::text[]`),
    status: roomStatusEnum().notNull().default("active"),
    note: text().notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.campusId, table.code),
    index().on(table.campusId),
    check("rooms_capacity_positive", sql`${table.capacity} > 0`),
    check("rooms_exam_capacity_range", sql`${table.examCapacity} > 0 AND ${table.examCapacity} <= ${table.capacity}`),
  ],
);
