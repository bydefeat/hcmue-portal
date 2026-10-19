import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { requirePermission } from "@/modules/access/access.query";
import { RegulationForm } from "@/modules/settings/components/regulation-form";
import { getLatestRegulation, getRegulationVersions } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Quy chế đào tạo" };

export default async function Page() {
  await requirePermission("settings.manage");
  const [regulation, versions] = await Promise.all([getLatestRegulation(), getRegulationVersions()]);
  return (
    <>
      <PageHeader
        title="Quy chế đào tạo"
        description="Các tham số hệ thống dùng để quy đổi điểm, kiểm tra đăng ký, xét cảnh báo và tính hạn xử lý. Mỗi lần lưu tạo một phiên bản có ngày áp dụng."
      />
      <RegulationForm regulation={regulation} versions={versions} />
    </>
  );
}
