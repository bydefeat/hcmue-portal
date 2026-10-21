import "server-only";
import { formatDate } from "@/shared/libs/date.lib";
import { buildPdf, type PdfBlock } from "@/shared/libs/pdf.lib";
import { DECISION_KIND_LABEL, DECISION_STATUS, decisionDetail } from "@/modules/users/users.constant";
import type { StudentDecision } from "@/modules/users/users.type";

export function decisionPdf(decision: StudentDecision) {
  const notice: PdfBlock[] =
    decision.status === "signed"
      ? []
      : [{ type: "paragraph", bold: true, align: "center", text: `Bản ${DECISION_STATUS[decision.status].label.toLowerCase()}, không có giá trị thi hành.` }];
  return buildPdf({
    title: "Quyết định",
    subtitle: `Về việc ${DECISION_KIND_LABEL[decision.kind].toLowerCase()}`,
    parent: "Bộ Giáo dục và Đào tạo",
    reference: `Số: ${decision.number ?? "...../QĐ-ĐHSP"}`,
    motto: true,
    dateLine: `TP. Hồ Chí Minh, ngày ${formatDate(decision.signedAt ?? decision.effectiveDate)}`,
    hideExportedAt: true,
    blocks: [
      ...notice,
      {
        type: "paragraph",
        align: "justify",
        text: `Căn cứ Quy chế đào tạo trình độ đại học hiện hành của Trường Đại học Sư phạm Thành phố Hồ Chí Minh; căn cứ ${decision.basis.toLowerCase()};`,
      },
      { type: "paragraph", text: "Xét đề nghị của Trưởng phòng Đào tạo," },
      { type: "paragraph", bold: true, align: "center", text: "QUYẾT ĐỊNH:" },
      {
        type: "paragraph",
        align: "justify",
        text: [
          { text: "Điều 1. ", bold: true },
          { text: `${decision.title} đối với sinh viên ${decision.studentName}, mã số ${decision.studentCode}, lớp ${decision.className}, ${decision.faculty}.${decisionDetail(decision)}` },
        ],
      },
      { type: "paragraph", text: [{ text: "Điều 2. ", bold: true }, { text: `Quyết định có hiệu lực từ ngày ${formatDate(decision.effectiveDate)}.` }] },
      {
        type: "paragraph",
        align: "justify",
        text: [{ text: "Điều 3. ", bold: true }, { text: "Trưởng phòng Đào tạo, Trưởng khoa và sinh viên có tên tại Điều 1 chịu trách nhiệm thi hành quyết định này." }],
      },
      { type: "space", height: 6 },
      { type: "signature", lines: ["KT. HIỆU TRƯỞNG", "PHÓ HIỆU TRƯỞNG"], name: decision.signedBy ? decision.signedBy.split(",")[0] : "Chưa ký" },
    ],
  });
}
