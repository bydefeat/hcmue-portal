"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_ROLE_COOKIE } from "./access.constant";
import { ROLE_ASSIGNMENTS } from "./access.mock";

const schema = z.object({ assignmentId: z.string().min(1) });

export async function switchDemoViewer(formData: FormData) {
  const parsed = schema.safeParse({ assignmentId: formData.get("assignmentId") });
  if (!parsed.success || !ROLE_ASSIGNMENTS.some((entry) => entry.id === parsed.data.assignmentId)) return;
  const cookieStore = await cookies();
  cookieStore.set(DEMO_ROLE_COOKIE, parsed.data.assignmentId, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/administrator");
}
