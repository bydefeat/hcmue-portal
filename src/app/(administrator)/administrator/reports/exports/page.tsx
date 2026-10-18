import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { requirePermission } from "@/modules/access/access.query";
import { getCurrentTerm, getTerms } from "@/modules/course-registration/course-registration.query";
import { ReportExportCenter, type ReportDefinition } from "@/modules/settings/components/report-export-center";

export const metadata: Metadata = { title: "Xuất báo cáo" };

const REPORTS: ReportDefinition[] = [
  { id: "moet", name: "Báo cáo thống kê sinh viên theo ngành", description: "Số sinh viên đang học, bảo lưu, thôi học theo ngành và khóa, theo mẫu báo cáo định kỳ của Bộ Giáo dục và Đào tạo.", audience: "Bộ Giáo dục và Đào tạo" },
  { id: "warnings", name: "Danh sách cảnh báo học vụ", description: "Sinh viên bị cảnh báo theo mức, kèm CPA, số tín chỉ nợ và trạng thái xử lý của cố vấn.", audience: "Khoa, cố vấn học tập" },
  { id: "registration", name: "Tỉ lệ đăng ký học phần", description: "Số lớp mở, chỉ tiêu, số đã đăng ký và tỉ lệ lấp đầy theo khoa và học phần.", audience: "Ban Giám hiệu, khoa" },
  { id: "surveys", name: "Kết quả khảo sát giảng dạy", description: "Điểm trung bình theo câu hỏi, theo giảng viên và tỉ lệ phản hồi của từng lớp.", audience: "Phòng Khảo thí và Đảm bảo chất lượng" },
  { id: "standing", name: "Xếp loại học lực", description: "Phân bố xếp loại học lực theo khoa và khóa sau khi công bố điểm học kỳ.", audience: "Ban Giám hiệu" },
  { id: "graduation", name: "Danh sách xét tốt nghiệp", description: "Sinh viên đủ và chưa đủ điều kiện tốt nghiệp, kèm lý do chưa đạt.", audience: "Hội đồng xét tốt nghiệp" },
];

export default async function Page() {
  const viewer = await requirePermission("reports.view");
  const [terms, currentTerm] = await Promise.all([getTerms(), getCurrentTerm()]);
  const faculties = viewer.faculty ? [viewer.faculty] : [...new Set(MOCK_MAJORS.map((major) => major.faculty))];

  return (
    <>
      <PageHeader title="Xuất báo cáo" description="Các báo cáo định kỳ theo mẫu. Tệp được tạo nền và lưu trong lịch sử xuất 30 ngày." />
      <ReportExportCenter
        reports={REPORTS}
        terms={terms.map((term) => ({ id: term.id, name: term.shortName }))}
        faculties={faculties}
        defaultTermId={currentTerm.id}
        userName={viewer.name}
      />
    </>
  );
}
