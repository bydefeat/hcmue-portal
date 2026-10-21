import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { requirePermission } from "@/modules/access/access.query";
import { loadGraduationCandidates } from "@/modules/graduation/graduation.lib";
import { administrativeClasses } from "@/modules/users/users.schema";

export async function getGraduationCandidates() {
  const viewer = await requirePermission("graduation.manage");
  return loadGraduationCandidates(viewer);
}

export async function getGraduationCohortOptions(): Promise<number[]> {
  await requirePermission("graduation.manage");
  const rows = await db.selectDistinct({ cohort: administrativeClasses.cohort }).from(administrativeClasses).orderBy(asc(administrativeClasses.cohort));
  return rows.map((row) => row.cohort);
}
