export type SurveyQuestion = {
  id: string;
  group: string;
  text: string;
};

// Trạng thái suy ra từ thời gian mở, đóng (giờ DB): chưa mở, đang mở, đã đóng.
export type SurveyStatus = "upcoming" | "open" | "closed";

export type Survey = {
  id: string;
  termId: string;
  termName: string;
  title: string;
  opensAt: string;
  closesAt: string;
  status: SurveyStatus;
  // Đã xáo phiếu sau khi đóng: giảng viên mới xem được kết quả.
  isSealed: boolean;
  remindedAt: string | null;
  questions: SurveyQuestion[];
};

export type SectionSurveyResult = {
  classSectionId: string;
  classCode: string;
  courseName: string;
  lecturerId: string | null;
  lecturerName: string | null;
  faculty: string;
  enrolled: number;
  responses: number;
  averages: Record<string, number>;
  overall: number;
  comments: string[];
};

export type StudentSurveyTask = {
  classSectionId: string;
  classCode: string;
  courseName: string;
  lecturerName: string | null;
  // Chỉ biết đã gửi hay chưa: không lưu thời điểm gửi để phiếu không đối chiếu được với người gửi.
  isSubmitted: boolean;
};
