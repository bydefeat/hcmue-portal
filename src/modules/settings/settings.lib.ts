import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { schoolToday } from "@/shared/libs/date.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { regulations, type RegulationRules } from "@/modules/settings/settings.schema";
import type { RegulationSettings } from "@/modules/settings/settings.type";

type Executor = Transaction | typeof db;

export const REGULATION_COLUMNS = {
  version: regulations.version,
  effectiveFrom: regulations.effectiveFrom,
  rules: regulations.rules,
  createdAt: regulations.createdAt,
  createdBy: user.name,
};

type RegulationRow = { version: string; effectiveFrom: string; rules: RegulationRules; createdAt: Date; createdBy: string | null };

export function toRegulation({ version, effectiveFrom, rules, createdAt, createdBy }: RegulationRow): RegulationSettings {
  return { version, effectiveFrom, updatedAt: createdAt.toISOString(), updatedBy: createdBy ?? "Hệ thống", ...rules };
}

// Bản quy chế áp dụng tại một ngày: ngày áp dụng gần nhất không sau ngày đó. Chưa có bản nào tới ngày thì lấy bản sớm nhất.
// Nguồn duy nhất của mọi tham số quy chế; dùng được trong transaction của nơi gọi (cron, action) và không kiểm quyền.
export async function regulationAt(executor: Executor, date: string = schoolToday()): Promise<RegulationSettings> {
  const [row] = await executor
    .select(REGULATION_COLUMNS)
    .from(regulations)
    .leftJoin(user, eq(user.id, regulations.createdByUserId))
    .orderBy(
      sql`${regulations.effectiveFrom} <= ${date}::date DESC`,
      sql`CASE WHEN ${regulations.effectiveFrom} <= ${date}::date THEN ${regulations.effectiveFrom} END DESC`,
      asc(regulations.effectiveFrom),
    )
    .limit(1);
  if (!row) throw new Error("Chưa có quy chế đào tạo trong hệ thống");
  return toRegulation(row);
}
