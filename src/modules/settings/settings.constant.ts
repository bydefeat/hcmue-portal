import type { CalendarEventKind, CefrLevel, DisciplineLevel, RankedStanding, ReportDefinition } from "@/modules/settings/settings.type";

export const CALENDAR_EVENT_LABEL: Record<CalendarEventKind, string> = {
  teaching: "Giảng dạy",
  registration: "Đăng ký học phần",
  exam: "Thi",
  grading: "Nhập và công bố điểm",
  holiday: "Nghỉ lễ",
  event: "Sự kiện",
};

export const CALENDAR_EVENT_OPTIONS = Object.entries(CALENDAR_EVENT_LABEL).map(([value, label]) => ({ value, label }));

export const MANUAL_CALENDAR_EVENT_KINDS = ["exam", "grading", "holiday", "event"] as const;

export const MANUAL_CALENDAR_EVENT_OPTIONS = MANUAL_CALENDAR_EVENT_KINDS.map((value) => ({ value, label: CALENDAR_EVENT_LABEL[value] }));

// Mốc tự nhập phải nằm trong học kỳ, cho phép trước và sau học kỳ ngần này ngày (nghỉ lễ, nhập và công bố điểm giáp học kỳ).
export const CALENDAR_TERM_MARGIN_DAYS = 31;

// Nhãn từng tham số quy chế, dùng để ghi nhật ký thay đổi theo đúng tên ô trên form.
export const REGULATION_FIELD_LABEL = {
  "grading.roundingStep": "Làm tròn điểm học phần đến",
  "grading.standing.excellent": "Xuất sắc: CPA từ",
  "grading.standing.veryGood": "Giỏi: CPA từ",
  "grading.standing.good": "Khá: CPA từ",
  "grading.standing.average": "Trung bình: CPA từ",
  "grading.standing.weak": "Yếu: CPA từ",
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
  "warning.expelAfterWarnings": "Đề xuất thôi học khi bị cảnh báo liên tiếp (học kỳ)",
  "attendance.absenceLimitPercent": "Vắng quá thì cấm thi (%)",
  "workflow.gradeEntryDays": "Hạn nhập điểm sau ngày thi (ngày)",
  "workflow.gradeDueSoonDays": "Nhắc sắp hết hạn trước (ngày)",
  "workflow.studyPlanReviewDays": "Cố vấn duyệt kế hoạch trong (ngày)",
  "workflow.regradeWindowDays": "Nhận đơn phúc khảo trong (ngày)",
  "workflow.registrationClosingSoonHours": "Báo đợt sắp đóng trước (giờ)",
  "graduation.retakeLimitPercent": "Giảm hạng khi học lại vượt (% tín chỉ chương trình)",
  "graduation.downgradeDisciplineLevel": "Giảm hạng khi bị kỷ luật từ mức",
  "graduation.downgradeStandings": "Hạng tốt nghiệp bị giảm",
  "graduation.languageMinLevel": "Chuẩn ngoại ngữ tối thiểu",
  "graduation.requireItCertificate": "Bắt buộc chứng chỉ tin học",
} as const;

export type RegulationFieldPath = keyof typeof REGULATION_FIELD_LABEL;

export const ROUNDING_STEPS = [0.1, 0.5, 1] as const;

export const CEFR_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const DISCIPLINE_LEVEL_LABEL: Record<DisciplineLevel, string> = {
  reprimand: "Khiển trách",
  warning: "Cảnh cáo",
  suspension: "Đình chỉ học tập có thời hạn",
  expulsion: "Buộc thôi học",
};

export const DISCIPLINE_LEVELS = Object.keys(DISCIPLINE_LEVEL_LABEL) as DisciplineLevel[];

export const RANKED_STANDING_LABEL: Record<RankedStanding, string> = {
  excellent: "Xuất sắc",
  "very-good": "Giỏi",
  good: "Khá",
  average: "Trung bình",
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "moet",
    name: "Báo cáo thống kê sinh viên theo ngành",
    description: "Số sinh viên đang học, bảo lưu, thôi học theo ngành và khóa tại thời điểm xuất, theo mẫu báo cáo định kỳ của Bộ Giáo dục và Đào tạo.",
    audience: "Bộ Giáo dục và Đào tạo",
    usesTerm: false,
    facultyBasis: "student",
    permission: "reports.view",
  },
  {
    id: "warnings",
    name: "Danh sách cảnh báo học vụ",
    description: "Sinh viên bị cảnh báo theo mức trong học kỳ, kèm CPA, số tín chỉ nợ và trạng thái xử lý của cố vấn.",
    audience: "Khoa, cố vấn học tập",
    usesTerm: true,
    facultyBasis: "student",
    permission: "reports.view",
  },
  {
    id: "registration",
    name: "Tỉ lệ đăng ký học phần",
    description: "Số lớp mở, chỉ tiêu, số đã đăng ký và tỉ lệ lấp đầy của từng lớp trong học kỳ.",
    audience: "Ban Giám hiệu, khoa",
    usesTerm: true,
    facultyBasis: "course",
    permission: "reports.view",
  },
  {
    id: "surveys",
    name: "Kết quả khảo sát giảng dạy",
    description: "Điểm trung bình và tỉ lệ phản hồi khảo sát của từng lớp trong học kỳ, theo giảng viên.",
    audience: "Phòng Khảo thí và Đảm bảo chất lượng",
    usesTerm: true,
    facultyBasis: "course",
    permission: "surveys.view",
  },
  {
    id: "standing",
    name: "Xếp loại học lực",
    description: "Tín chỉ tích lũy, CPA và xếp loại học lực của sinh viên đang học, tính đến hết học kỳ đã chọn.",
    audience: "Ban Giám hiệu",
    usesTerm: true,
    facultyBasis: "student",
    permission: "reports.view",
  },
  {
    id: "graduation",
    name: "Danh sách xét tốt nghiệp",
    description: "Hồ sơ xét tốt nghiệp hiện có: chứng chỉ, học phí, kỷ luật và trạng thái xét tại thời điểm xuất.",
    audience: "Hội đồng xét tốt nghiệp",
    usesTerm: false,
    facultyBasis: "student",
    permission: "graduation.manage",
  },
];

export const REPORT_FACULTY_BASIS_LABEL: Record<ReportDefinition["facultyBasis"], string> = {
  student: "Lọc theo khoa của sinh viên",
  course: "Lọc theo khoa quản lý học phần",
};

// Lịch sử xuất giữ ngần này ngày; tác vụ report-exports xóa dòng và tệp cũ hơn.
export const REPORT_EXPORT_RETENTION_DAYS = 30;

// Excel (.xlsx: tiêu đề in đậm, cố định hàng tiêu đề, ô số là số), PDF (in, gửi kèm văn bản) hoặc CSV (UTF-8 có BOM) cho phần mềm khác nhập lại.
export const REPORT_FORMATS = ["xlsx", "pdf", "csv"] as const;

export const REPORT_FORMAT_LABEL: Record<(typeof REPORT_FORMATS)[number], string> = {
  xlsx: "Excel (.xlsx)",
  pdf: "PDF (.pdf)",
  csv: "CSV (.csv)",
};

export const SETTINGS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  regulations_version_unique: "Đã có phiên bản quy chế cùng số hiệu, tải lại trang để xem phiên bản mới nhất.",
  regulations_effective_from_unique: "Đã có phiên bản quy chế áp dụng từ ngày này, chọn ngày áp dụng khác.",
  regulations_rules_object: "Quy chế thiếu nhóm tham số bắt buộc.",
  calendar_events_date_order: "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.",
  calendar_events_term_id_terms_id_fk: "Học kỳ không còn tồn tại, tải lại trang.",
  report_exports_done_fields: "Báo cáo đã tạo xong phải có tệp (khóa lưu trữ, tên, kiểu, kích thước) và số dòng.",
  report_exports_storage_key_unique: "Tệp báo cáo bị trùng khóa lưu trữ. Xuất lại.",
  report_exports_finished_fields: "Báo cáo chỉ có thời điểm hoàn tất khi đã xong hoặc lỗi.",
};
