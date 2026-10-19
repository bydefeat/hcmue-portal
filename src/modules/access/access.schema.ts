import { boolean, index, pgEnum, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import type { Permission } from "@/modules/access/access.type";

export const roleScopeEnum = pgEnum("role_scope", ["university", "faculty"]);

export const roles = pgTable("roles", {
  id: primaryId(),
  // Khoá cố định của vai trò hệ thống ("faculty-secretary"...) để code nhận ra vai trò; vai trò tự tạo để trống.
  key: text().unique("roles_key_unique"),
  name: text().notNull().unique("roles_name_unique"),
  description: text().notNull().default(""),
  scope: roleScopeEnum().notNull(),
  isSystem: boolean().notNull().default(false),
  ...timestamps(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text().$type<Permission>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permission] })],
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    facultyId: uuid().references(() => faculties.id, { onDelete: "cascade" }),
    grantedAt: createdAt(),
    grantedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    unique("role_assignments_user_id_role_id_faculty_id_unique").on(table.userId, table.roleId, table.facultyId).nullsNotDistinct(),
    index().on(table.roleId),
    index().on(table.facultyId),
    index().on(table.grantedByUserId),
  ],
);
