import type { Transaction } from "@/shared/libs/db.lib";
import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { REGULATION } from "@/modules/settings/settings.mock";
import { regulations } from "@/modules/settings/settings.schema";
import { PRICE_PER_CREDIT } from "@/modules/tuition/tuition.constant";
import { tuitionFees, tuitionRates } from "@/modules/tuition/tuition.schema";
import type { SeedContext } from "./context";

// Cấu hình dùng chung: quy chế đào tạo đang áp dụng, đơn giá tín chỉ theo ngành và khoản thu cố định.
export async function seedSettings(tx: Transaction, context: SeedContext) {
  const { grading, credits, warning, attendance, workflow } = REGULATION;
  await tx.insert(regulations).values({
    version: REGULATION.version,
    effectiveFrom: REGULATION.effectiveFrom,
    decision: "Quyết định 2412/QĐ-ĐHSP",
    summary: "Quy chế đào tạo trình độ đại học theo hệ thống tín chỉ",
    rules: { grading, credits, warning, attendance, workflow },
    createdByUserId: context.adminUserId,
  });
  await tx
    .insert(tuitionRates)
    .values(MOCK_MAJORS.map((major) => ({ academicYear: 2026, majorId: context.majorByCode.get(major.code)!.id, pricePerCredit: PRICE_PER_CREDIT[major.code] ?? 0 })));
  await tx.insert(tuitionFees).values({ academicYear: 2026, code: "bhyt", label: "Bảo hiểm y tế 12 tháng", amount: 1_263_600 });
}
