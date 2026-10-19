"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/modules/authentication/authentication.query";
import { ACTIVE_ASSIGNMENT_COOKIE } from "@/modules/access/access.constant";
import { getViewerAssignments } from "@/modules/access/access.query";

const schema = z.object({ assignmentId: z.uuid() });

// Đổi vai trò đang dùng khi một tài khoản được cấp nhiều vai trò quản trị.
export async function switchActiveRole(formData: FormData) {
  const { user } = await requireRole("admin");
  const parsed = schema.safeParse({ assignmentId: formData.get("assignmentId") });
  if (!parsed.success) return;
  const assignments = await getViewerAssignments(user.id);
  if (!assignments.some((assignment) => assignment.id === parsed.data.assignmentId)) return;
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ASSIGNMENT_COOKIE, parsed.data.assignmentId, { path: "/administrator", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  redirect("/administrator");
}
