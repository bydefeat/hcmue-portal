import { Card } from "antd";
import { formatDate } from "@/shared/libs/date.lib";
import { DECISION_KIND_LABEL, decisionDetail } from "@/modules/users/users.constant";
import type { StudentDecision } from "@/modules/users/users.type";

export function DecisionPreview({ decision }: { decision: StudentDecision }) {
  return (
    <Card classNames={{ body: "flex flex-col gap-4 p-6 text-sm leading-relaxed" }}>
      <header className="grid grid-cols-2 gap-4 text-center text-xs">
        <div className="flex flex-col">
          <span>BỘ GIÁO DỤC VÀ ĐÀO TẠO</span>
          <span className="font-semibold">TRƯỜNG ĐẠI HỌC SƯ PHẠM</span>
          <span className="font-semibold">THÀNH PHỐ HỒ CHÍ MINH</span>
          <span className="mt-1">Số: {decision.number ?? "...../QĐ-ĐHSP"}</span>
        </div>
        <div className="flex flex-col">
          <span className="font-semibold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</span>
          <span className="font-semibold">Độc lập, Tự do, Hạnh phúc</span>
          <span className="mt-1 italic">TP. Hồ Chí Minh, ngày {formatDate(decision.signedAt ?? decision.effectiveDate)}</span>
        </div>
      </header>
      <h3 className="text-center text-base font-semibold uppercase">Quyết định</h3>
      <p className="text-center font-semibold">Về việc {DECISION_KIND_LABEL[decision.kind].toLowerCase()}</p>
      <p className="text-pretty">Căn cứ Quy chế đào tạo trình độ đại học hiện hành của Trường Đại học Sư phạm Thành phố Hồ Chí Minh; căn cứ {decision.basis.toLowerCase()};</p>
      <p className="text-pretty">Xét đề nghị của Trưởng phòng Đào tạo,</p>
      <p className="text-center font-semibold">QUYẾT ĐỊNH:</p>
      <p className="text-pretty">
        <span className="font-semibold">Điều 1.</span> {decision.title} đối với sinh viên {decision.studentName}, mã số {decision.studentCode}, lớp {decision.className}, {decision.faculty}.{decisionDetail(decision)}
      </p>
      <p className="text-pretty">
        <span className="font-semibold">Điều 2.</span> Quyết định có hiệu lực từ ngày {formatDate(decision.effectiveDate)}.
      </p>
      <p className="text-pretty">
        <span className="font-semibold">Điều 3.</span> Trưởng phòng Đào tạo, Trưởng khoa và sinh viên có tên tại Điều 1 chịu trách nhiệm thi hành quyết định này.
      </p>
      <footer className="ml-auto flex w-60 flex-col items-center gap-1 text-center">
        <span className="font-semibold">KT. HIỆU TRƯỞNG</span>
        <span className="font-semibold">PHÓ HIỆU TRƯỞNG</span>
        <span className="mt-10">{decision.signedBy ? decision.signedBy.split(",")[0] : "Chưa ký"}</span>
      </footer>
    </Card>
  );
}
