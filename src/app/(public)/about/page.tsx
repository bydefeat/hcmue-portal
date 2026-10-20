import type { Metadata } from "next";
import Link from "next/link";
import { Card, Collapse } from "antd";
import { Location, Phone } from "defeat-icons-react";
import { getRegulationVersions } from "@/modules/settings/settings.query";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { formatDate } from "@/shared/libs/date.lib";
import { PUBLIC_SIGN_IN_HREF } from "@/shared/constants/navigation.constant";

export const metadata: Metadata = { title: "Giới thiệu" };

const MODULES = [
  { title: "Đăng ký học phần", text: "Hệ thống kiểm tra học phần tiên quyết, trùng lịch, số chỗ và hạn mức tín chỉ ngay khi sinh viên chọn lớp, trước khi bấm đăng ký." },
  { title: "Thời khóa biểu, lịch thi", text: "Lịch học theo tuần, xuất sang lịch điện thoại bằng tệp .ics; lịch thi có phòng thi và cảnh báo cấm thi khi vắng quá quy định." },
  { title: "Kết quả học tập", text: "Bảng điểm theo học kỳ, điểm trung bình học kỳ và tích lũy, tiến độ theo chương trình đào tạo." },
  { title: "Cố vấn học tập", text: "Sinh viên lập kế hoạch học tập, cố vấn duyệt; theo dõi sinh viên bị cảnh báo học vụ và lịch hẹn." },
  { title: "Đơn từ trực tuyến", text: "Học vượt tín chỉ, rút học phần, phúc khảo, hoãn thi, bảo lưu, cấp bảng điểm; xem từng bước xử lý và hạn trả lời." },
  { title: "Quản lý đào tạo", text: "Chương trình đào tạo, mở lớp, đợt đăng ký, duyệt và công bố điểm, quyết định sinh viên, xét tốt nghiệp, báo cáo." },
];

const FAQ = [
  { q: "Tài khoản đăng nhập lấy ở đâu?", a: "Tài khoản do Trường cấp: sinh viên đăng nhập bằng mã số sinh viên (ví dụ 50.01.104.013), giảng viên và cán bộ đăng nhập bằng mã số cán bộ, giảng viên (ví dụ GV104011), không dùng email. Lần đầu dùng cổng, chọn Kích hoạt tài khoản ở trang đăng nhập để tự đặt mật khẩu. Cổng không có chức năng tự đăng ký." },
  { q: "Quên mật khẩu thì làm gì?", a: "Chọn Quên mật khẩu ở trang đăng nhập, nhập email trường cấp (sinh viên dạng 5001104013@student.hcmue.edu.vn, cán bộ và giảng viên dùng email công vụ) để nhận mã đặt lại gồm 6 số. Đăng nhập sai quá 10 lần trong 15 phút thì tài khoản bị tạm khóa đăng nhập 15 phút; đặt lại mật khẩu thành công sẽ gỡ khóa ngay." },
  { q: "Vì sao tôi không đăng ký được một lớp?", a: "Lý do hiện ngay trên dòng của lớp đó: chưa đạt học phần tiên quyết, trùng lịch với lớp đã chọn, lớp đã đủ chỗ, vượt hạn mức tín chỉ hoặc chưa đến đợt đăng ký của khóa." },
  { q: "Muốn học quá 25 tín chỉ trong một học kỳ?", a: "Gửi đơn Học vượt tín chỉ ở mục Đơn từ. Đơn qua cố vấn học tập, khoa và Phòng Đào tạo; chỉ xét cho sinh viên có điểm trung bình tích lũy từ 2,5." },
  { q: "Điểm của tôi khi nào hiện trên cổng?", a: "Sau khi giảng viên chốt điểm, khoa duyệt và Phòng Đào tạo công bố. Có thể nộp đơn phúc khảo trong 7 ngày kể từ ngày công bố." },
];

export default async function Page() {
  const versions = await getRegulationVersions();
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Giới thiệu cổng đào tạo"
        description="Cổng thông tin đào tạo và học vụ của Trường Đại học Sư phạm Thành phố Hồ Chí Minh, dùng chung cho sinh viên, giảng viên, cố vấn học tập và Phòng Đào tạo."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Chức năng chính</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <li key={module.title}>
              <Card size="small" className="h-full" classNames={{ body: "flex flex-col gap-1" }}>
                <span className="text-base font-medium">{module.title}</span>
                <span className="text-sm text-pretty text-muted">{module.text}</span>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-lg font-semibold">Câu hỏi thường gặp</h2>
          <Collapse items={FAQ.map((item) => ({ key: item.q, label: item.q, children: <p className="text-sm text-pretty">{item.a}</p> }))} className="bg-surface" />
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Quy chế đang áp dụng" flush>
            <ul className="flex flex-col divide-y divide-border-strong">
              {versions.map((version, index) => (
                <li key={version.version} className="flex flex-col gap-1 px-4 sm:px-5 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Phiên bản {version.version}</span>
                    {index === 0 && <span className="text-xs text-primary">Hiện hành</span>}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    Quyết định {version.decision}, áp dụng từ {formatDate(version.effectiveFrom)}
                  </span>
                  <span className="text-sm text-pretty text-muted">{version.summary}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Liên hệ">
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-sm text-pretty">
                <Location size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                280 An Dương Vương, Phường Chợ Quán, Thành phố Hồ Chí Minh
              </p>
              <p className="flex items-center gap-2 text-sm">
                <Phone size={18} aria-hidden className="shrink-0 text-muted" />
                <a href="tel:02838352020" className="tabular-nums">
                  028 - 38352020
                </a>
              </p>
              <Link href={PUBLIC_SIGN_IN_HREF} className="text-sm">
                Đăng nhập cổng
              </Link>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
