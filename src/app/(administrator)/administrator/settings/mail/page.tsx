import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { requireSchoolWidePermission } from "@/modules/access/access.query";
import { MailProblemTable } from "@/modules/mail/components/mail-problem-table";
import { getMailOutboxOverview } from "@/modules/mail/mail.query";
import { MAIL_MAX_ATTEMPTS } from "@/modules/mail/mail.rule";

export const metadata: Metadata = { title: "Hàng đợi thư" };

export default async function Page() {
  await requireSchoolWidePermission("settings.manage");
  const { stats, problems } = await getMailOutboxOverview();
  return (
    <>
      <PageHeader
        title="Hàng đợi thư"
        description={`Thư kích hoạt tài khoản, nhắc đăng ký học phần và thông báo lớp được gửi qua hàng đợi. Thư lỗi tự gửi lại sau 1, 5, 30 phút, 2 giờ, 8 giờ; lỗi ${MAIL_MAX_ATTEMPTS} lần thì dừng, chờ gửi lại bằng tay.`}
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Đang chờ gửi" value={stats.pending} hint={stats.retrying > 0 ? `${stats.retrying} thư chờ gửi lại sau lỗi` : "Thư mới đi trong vài giây"} tone={stats.retrying > 0 ? "warning" : undefined} />
          <StatTile label="Đã gửi" value={stats.sentLast30Days} hint="Trong 30 ngày qua" />
          <StatTile label="Lỗi, đã ngừng thử" value={stats.failed} hint={stats.failed > 0 ? "Kiểm địa chỉ, khóa Resend rồi gửi lại" : "Không có"} tone={stats.failed > 0 ? "danger" : undefined} />
        </div>
        <SectionCard title="Thư lỗi gần đây">
          <MailProblemTable problems={problems} />
        </SectionCard>
      </div>
    </>
  );
}
