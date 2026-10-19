import type { CalendarEventKind, ReportDefinition } from "@/modules/settings/settings.type";

export const CALENDAR_EVENT_LABEL: Record<CalendarEventKind, string> = {
  teaching: "Giảng dạy",
  registration: "Đăng ký học phần",
  exam: "Thi",
  grading: "Nhập và công bố điểm",
  holiday: "Nghỉ lễ",
  event: "Sự kiện",
};

export const CALENDAR_EVENT_OPTIONS = Object.entries(CALENDAR_EVENT_LABEL).map(([value, label]) => ({ value, label }));

// Nhãn từng tham số quy chế, dùng để ghi nhật ký thay đổi theo đúng tên ô trên form.
export const REGULATION_FIELD_LABEL = {
  "grading.passScore": "Điểm đạt học phần",
  "grading.roundingStep": "Làm tròn điểm học phần",
  "credits.minPerTerm": "Tín chỉ tối thiểu mỗi học kỳ",
  "credits.maxPerTerm": "Tín chỉ tối đa mỗi học kỳ",
  "credits.maxSummer": "Tín chỉ tối đa học kỳ hè",
  "credits.maxWhenWarned": "Tín chỉ tối đa khi bị cảnh báo",
  "credits.overloadMinCpa": "CPA tối thiểu để học vượt",
  "warning.level1TermGpa": "Mức 1: ĐTB học kỳ dưới",
  "warning.level1FailedCredits": "Mức 1: nợ từ (tín chỉ)",
  "warning.level2Cpa": "Mức 2: CPA dưới",
  "warning.level2FailedCredits": "Mức 2: nợ từ (tín chỉ)",
  "warning.level3Cpa": "Mức 3: CPA dưới",
  "attendance.absenceLimitPercent": "Vắng quá thì cấm thi (%)",
  "workflow.gradeEntryDays": "Hạn nhập điểm sau ngày thi (ngày)",
  "workflow.gradeDueSoonDays": "Nhắc sắp hết hạn trước (ngày)",
  "workflow.studyPlanReviewDays": "Cố vấn duyệt kế hoạch trong (ngày)",
  "workflow.regradeWindowDays": "Nhận đơn phúc khảo trong (ngày)",
  "workflow.registrationClosingSoonHours": "Báo đợt sắp đóng trước (giờ)",
} as const;

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { id: "moet", name: "Báo cáo thống kê sinh viên theo ngành", description: "Số sinh viên đang học, bảo lưu, thôi học theo ngành và khóa, theo mẫu báo cáo định kỳ của Bộ Giáo dục và Đào tạo.", audience: "Bộ Giáo dục và Đào tạo" },
  { id: "warnings", name: "Danh sách cảnh báo học vụ", description: "Sinh viên bị cảnh báo theo mức, kèm CPA, số tín chỉ nợ và trạng thái xử lý của cố vấn.", audience: "Khoa, cố vấn học tập" },
  { id: "registration", name: "Tỉ lệ đăng ký học phần", description: "Số lớp mở, chỉ tiêu, số đã đăng ký và tỉ lệ lấp đầy theo khoa và học phần.", audience: "Ban Giám hiệu, khoa" },
  { id: "surveys", name: "Kết quả khảo sát giảng dạy", description: "Điểm trung bình theo câu hỏi, theo giảng viên và tỉ lệ phản hồi của từng lớp.", audience: "Phòng Khảo thí và Đảm bảo chất lượng" },
  { id: "standing", name: "Xếp loại học lực", description: "Phân bố xếp loại học lực theo khoa và khóa sau khi công bố điểm học kỳ.", audience: "Ban Giám hiệu" },
  { id: "graduation", name: "Danh sách xét tốt nghiệp", description: "Sinh viên đủ và chưa đủ điều kiện tốt nghiệp, kèm lý do chưa đạt.", audience: "Hội đồng xét tốt nghiệp" },
];

// Báo cáo xuất ra CSV (UTF-8 có BOM) để mở thẳng bằng Excel; chưa có thư viện tạo xlsx, pdf phía server.
export const REPORT_FORMATS = ["csv"] as const;

export const SETTINGS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  regulations_version_unique: "Đã có phiên bản quy chế cùng số hiệu, tải lại trang để xem phiên bản mới nhất.",
  regulations_effective_from_unique: "Đã có phiên bản quy chế áp dụng từ ngày này, chọn ngày áp dụng khác.",
  regulations_rules_object: "Quy chế thiếu nhóm tham số bắt buộc.",
  calendar_events_date_order: "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.",
  calendar_events_term_id_terms_id_fk: "Học kỳ không còn tồn tại, tải lại trang.",
  report_exports_done_fields: "Báo cáo đã tạo xong phải có tệp và số dòng.",
  report_exports_finished_fields: "Báo cáo chỉ có thời điểm hoàn tất khi đã xong hoặc lỗi.",
};
