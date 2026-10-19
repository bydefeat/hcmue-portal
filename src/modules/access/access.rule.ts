import { z } from "zod";
import { ALL_PERMISSIONS } from "@/modules/access/access.constant";

export const ROLE_PERMISSIONS_SCHEMA = z.object({
  roleId: z.uuid(),
  permissions: z
    .array(z.enum(ALL_PERMISSIONS as [string, ...string[]]))
    .min(1, "Vai trò cần ít nhất một quyền")
    .transform((permissions) => [...new Set(permissions)]),
});

export const GRANT_ROLE_SCHEMA = z.object({
  userId: z.uuid("Chưa chọn cán bộ"),
  roleId: z.uuid("Chưa chọn vai trò"),
  faculty: z.string().trim().optional(),
});

export type GrantRoleInput = z.input<typeof GRANT_ROLE_SCHEMA>;
