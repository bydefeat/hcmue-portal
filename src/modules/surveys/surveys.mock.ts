import { createRandom, mockDate, mockId, mockLecturerIdentity, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import type { SectionSurveyResult, Survey } from "@/modules/surveys/surveys.type";

export const SURVEY: Survey = {
  id: mockId("survey:ks-hk1-2026"),
  termId: mockTermId("hk1-2026"),
  title: "Khảo sát ý kiến người học về hoạt động giảng dạy, học kỳ 1, năm học 2026-2027",
  opensAt: mockDate(-5, "08:00"),
  closesAt: mockDate(30, "23:59"),
  questions: [
    { id: mockId("survey-question:ks-hk1-2026:q1"), group: "Nội dung học phần", text: "Đề cương và mục tiêu học phần được giới thiệu rõ từ buổi đầu" },
    { id: mockId("survey-question:ks-hk1-2026:q2"), group: "Nội dung học phần", text: "Nội dung cập nhật, gắn với thực tiễn nghề nghiệp" },
    { id: mockId("survey-question:ks-hk1-2026:q3"), group: "Phương pháp giảng dạy", text: "Giảng viên giải thích dễ hiểu, có ví dụ minh họa" },
    { id: mockId("survey-question:ks-hk1-2026:q4"), group: "Phương pháp giảng dạy", text: "Giảng viên khuyến khích sinh viên đặt câu hỏi và thảo luận" },
    { id: mockId("survey-question:ks-hk1-2026:q5"), group: "Kiểm tra đánh giá", text: "Cách tính điểm được công bố và áp dụng công bằng" },
    { id: mockId("survey-question:ks-hk1-2026:q6"), group: "Kiểm tra đánh giá", text: "Bài kiểm tra phản ánh đúng nội dung đã học" },
    { id: mockId("survey-question:ks-hk1-2026:q7"), group: "Tác phong", text: "Giảng viên lên lớp đúng giờ, đủ số buổi" },
    { id: mockId("survey-question:ks-hk1-2026:q8"), group: "Tổng thể", text: "Nhìn chung, tôi hài lòng với học phần này" },
  ],
};

type Seed = [sectionId: string, code: string, name: string, lecturerIndex: number | null, faculty: string, enrolled: number, quality: number];

const SEEDS: Seed[] = [
  [mockSectionId("hk1-2026", "COMP1020.01"), "COMP1020.01", "Cấu trúc dữ liệu và giải thuật", 0, "Khoa Công nghệ Thông tin", 42, 4.4],
  [mockSectionId("hk1-2026", "COMP1020.02"), "COMP1020.02", "Cấu trúc dữ liệu và giải thuật", 0, "Khoa Công nghệ Thông tin", 38, 4.2],
  [mockSectionId("hk1-2026", "COMP1070.01"), "COMP1070.01", "Phát triển ứng dụng web", 0, "Khoa Công nghệ Thông tin", 40, 4.6],
  [mockSectionId("hk1-2026", "COMP1080.01"), "COMP1080.01", "Trí tuệ nhân tạo", 0, "Khoa Công nghệ Thông tin", 47, 4.1],
  [mockSectionId("hk1-2026", "COMP1010.01"), "COMP1010.01", "Lập trình cơ bản", 6, "Khoa Công nghệ Thông tin", 49, 3.9],
  [mockSectionId("hk1-2026", "COMP1031.01"), "COMP1031.01", "Lập trình hướng đối tượng", 18, "Khoa Công nghệ Thông tin", 45, 4.3],
  [mockSectionId("hk1-2026", "COMP1060.01"), "COMP1060.01", "Hệ điều hành", 12, "Khoa Công nghệ Thông tin", 36, 3.4],
  [mockSectionId("hk1-2026", "MATH1011.01"), "MATH1011.01", "Giải tích 1", 1, "Khoa Toán - Tin học", 58, 4.0],
  [mockSectionId("hk1-2026", "MATH1013.01"), "MATH1013.01", "Xác suất thống kê", 7, "Khoa Toán - Tin học", 52, 3.2],
  [mockSectionId("hk1-2026", "LITR1010.01"), "LITR1010.01", "Văn học Việt Nam hiện đại", 2, "Khoa Ngữ văn", 47, 4.5],
  [mockSectionId("hk1-2026", "ENGL1002.01"), "ENGL1002.01", "Tiếng Anh 2", 3, "Khoa Tiếng Anh", 35, 4.7],
  [mockSectionId("hk1-2026", "PHYS1010.01"), "PHYS1010.01", "Điện và từ", 4, "Khoa Vật lý", 34, 3.8],
  [mockSectionId("hk1-2026", "PSYC1001.01"), "PSYC1001.01", "Tâm lý học giáo dục", 5, "Khoa Tâm lý học", 76, 4.2],
];

const COMMENTS_GOOD = [
  "Thầy cô giảng rất dễ hiểu, bài tập sát với đề thi.",
  "Có nhiều ví dụ thực tế, em thích phần làm dự án nhóm.",
  "Slide và tài liệu được gửi trước buổi học.",
];

const COMMENTS_BAD = [
  "Mong giảng viên công bố điểm giữa kỳ sớm hơn.",
  "Phòng học nóng, máy chiếu mờ.",
  "Tốc độ giảng hơi nhanh ở các chương cuối.",
  "Giảng viên hay vào lớp trễ 10 đến 15 phút.",
];

export const SURVEY_RESULTS: SectionSurveyResult[] = SEEDS.map(([classSectionId, classCode, courseName, lecturerIndex, faculty, enrolled, quality], index) => {
  const random = createRandom(index * 41 + 7);
  const lecturer = lecturerIndex === null ? null : mockLecturerIdentity(lecturerIndex);
  const averages = Object.fromEntries(
    SURVEY.questions.map((question) => [question.id, Math.min(5, Math.max(1, Math.round((quality + (random() - 0.5) * 0.8) * 100) / 100))]),
  );
  const values = Object.values(averages);
  return {
    classSectionId,
    classCode,
    courseName,
    lecturerId: lecturer?.id ?? null,
    lecturerName: lecturer?.displayName ?? null,
    faculty,
    enrolled,
    responses: Math.round(enrolled * (0.35 + random() * 0.5)),
    averages,
    overall: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
    comments: quality >= 4 ? [COMMENTS_GOOD[index % 3], COMMENTS_BAD[index % 4]] : [COMMENTS_BAD[index % 4], COMMENTS_BAD[(index + 1) % 4], COMMENTS_GOOD[index % 3]],
  };
});
