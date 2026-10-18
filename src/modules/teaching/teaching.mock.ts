import { mockDate, mockLecturerIdentity } from "@/shared/libs/mock.lib";
import type { ClassAnnouncement, Syllabus, SyllabusAssessment, SyllabusWeek } from "./teaching.type";

const TOPICS: Record<string, string[]> = {
  COMP1020: [
    "Giới thiệu, độ phức tạp thuật toán",
    "Mảng và danh sách liên kết",
    "Ngăn xếp và hàng đợi",
    "Đệ quy và chia để trị",
    "Các thuật toán sắp xếp cơ bản",
    "Sắp xếp nhanh, sắp xếp trộn",
    "Tìm kiếm tuần tự, nhị phân",
    "Kiểm tra giữa kỳ",
    "Cây nhị phân, cây nhị phân tìm kiếm",
    "Cây cân bằng AVL",
    "Bảng băm",
    "Đồ thị, biểu diễn đồ thị",
    "Duyệt đồ thị BFS, DFS",
    "Đường đi ngắn nhất Dijkstra",
    "Ôn tập, giải đề",
  ],
  COMP1070: [
    "Tổng quan ứng dụng web, HTTP",
    "HTML ngữ nghĩa và khả năng truy cập",
    "CSS, bố cục flex và grid",
    "JavaScript cơ bản",
    "DOM và sự kiện",
    "Gọi API với fetch",
    "Giới thiệu React",
    "Trạng thái và form trong React",
    "Xây dựng REST API với Node.js",
    "Cơ sở dữ liệu quan hệ cho web",
    "Xác thực và phân quyền",
    "Kiểm thử ứng dụng web",
    "Triển khai và giám sát",
    "Báo cáo tiến độ đồ án",
    "Bảo vệ đồ án",
  ],
  COMP1080: [
    "Giới thiệu trí tuệ nhân tạo",
    "Tác tử thông minh",
    "Tìm kiếm mù",
    "Tìm kiếm có thông tin, A*",
    "Tìm kiếm đối kháng",
    "Bài toán thỏa mãn ràng buộc",
    "Logic mệnh đề",
    "Kiểm tra giữa kỳ",
    "Logic vị từ, suy diễn",
    "Biểu diễn tri thức",
    "Suy luận không chắc chắn, Bayes",
    "Nhập môn học máy",
    "Cây quyết định",
    "Mạng nơ-ron cơ bản",
    "Ôn tập",
  ],
};

function weeksOf(courseCode: string): SyllabusWeek[] {
  const topics = TOPICS[courseCode] ?? Array.from({ length: 15 }, (_, index) => `Chủ đề ${index + 1}`);
  return topics.map((topic, index) => ({
    week: index + 1,
    topic,
    activities: topic.startsWith("Kiểm tra") ? "Làm bài kiểm tra 60 phút" : index % 3 === 2 ? "Thực hành tại phòng máy, nộp bài trên hệ thống" : "Giảng lý thuyết, thảo luận nhóm",
    readings: topic.startsWith("Kiểm tra") || topic.startsWith("Ôn tập") ? "" : `Giáo trình chính, chương ${Math.min(index + 1, 12)}`,
  }));
}

const DEFAULT_ASSESSMENTS: SyllabusAssessment[] = [
  { key: "attendance", label: "Chuyên cần", weight: 10, method: "Điểm danh, tham gia thảo luận", outcomes: ["CLO4"] },
  { key: "midterm", label: "Giữa kỳ", weight: 30, method: "Tự luận 60 phút", outcomes: ["CLO1", "CLO2"] },
  { key: "final", label: "Cuối kỳ", weight: 60, method: "Tự luận 90 phút", outcomes: ["CLO1", "CLO2", "CLO3"] },
];

export const SYLLABI: Syllabus[] = [
  {
    classSectionId: "hk1-2026-comp1020-01",
    courseCode: "COMP1020",
    courseName: "Cấu trúc dữ liệu và giải thuật",
    status: "published",
    publishedAt: mockDate(-40, "09:00"),
    updatedAt: mockDate(-40, "09:00"),
    description: "Học phần trang bị các cấu trúc dữ liệu cơ bản và kỹ thuật phân tích, thiết kế giải thuật, làm nền cho các học phần chuyên ngành.",
    outcomes: [
      { code: "CLO1", text: "Phân tích được độ phức tạp thời gian và bộ nhớ của giải thuật" },
      { code: "CLO2", text: "Cài đặt được danh sách, ngăn xếp, hàng đợi, cây và bảng băm" },
      { code: "CLO3", text: "Chọn được cấu trúc dữ liệu phù hợp cho bài toán thực tế" },
      { code: "CLO4", text: "Làm việc nhóm, trình bày lời giải rõ ràng" },
    ],
    weeks: weeksOf("COMP1020"),
    assessments: DEFAULT_ASSESSMENTS,
    references: ["Cormen và cộng sự, Introduction to Algorithms, MIT Press, 2022", "Đỗ Xuân Lôi, Cấu trúc dữ liệu và giải thuật, NXB ĐHQG Hà Nội"],
  },
  {
    classSectionId: "hk1-2026-comp1020-02",
    courseCode: "COMP1020",
    courseName: "Cấu trúc dữ liệu và giải thuật",
    status: "published",
    publishedAt: mockDate(-40, "09:05"),
    updatedAt: mockDate(-40, "09:05"),
    description: "Học phần trang bị các cấu trúc dữ liệu cơ bản và kỹ thuật phân tích, thiết kế giải thuật, làm nền cho các học phần chuyên ngành.",
    outcomes: [
      { code: "CLO1", text: "Phân tích được độ phức tạp thời gian và bộ nhớ của giải thuật" },
      { code: "CLO2", text: "Cài đặt được danh sách, ngăn xếp, hàng đợi, cây và bảng băm" },
      { code: "CLO3", text: "Chọn được cấu trúc dữ liệu phù hợp cho bài toán thực tế" },
      { code: "CLO4", text: "Làm việc nhóm, trình bày lời giải rõ ràng" },
    ],
    weeks: weeksOf("COMP1020"),
    assessments: DEFAULT_ASSESSMENTS,
    references: ["Cormen và cộng sự, Introduction to Algorithms, MIT Press, 2022"],
  },
  {
    classSectionId: "hk1-2026-comp1070-01",
    courseCode: "COMP1070",
    courseName: "Phát triển ứng dụng web",
    status: "published",
    publishedAt: mockDate(-42, "14:00"),
    updatedAt: mockDate(-10, "20:30"),
    description: "Sinh viên xây dựng trọn vẹn một ứng dụng web theo nhóm, từ giao diện đến API và cơ sở dữ liệu.",
    outcomes: [
      { code: "CLO1", text: "Xây dựng giao diện web đúng chuẩn, truy cập được" },
      { code: "CLO2", text: "Thiết kế và cài đặt REST API có xác thực" },
      { code: "CLO3", text: "Triển khai ứng dụng lên môi trường thật" },
      { code: "CLO4", text: "Quản lý dự án nhóm với Git" },
    ],
    weeks: weeksOf("COMP1070"),
    assessments: [
      { key: "attendance", label: "Chuyên cần", weight: 10, method: "Điểm danh", outcomes: ["CLO4"] },
      { key: "project", label: "Đồ án", weight: 40, method: "Sản phẩm nhóm, báo cáo tuần 14", outcomes: ["CLO1", "CLO2", "CLO4"] },
      { key: "final", label: "Cuối kỳ", weight: 50, method: "Bảo vệ đồ án trước hội đồng", outcomes: ["CLO2", "CLO3"] },
    ],
    references: ["MDN Web Docs, developer.mozilla.org", "Tài liệu React, react.dev"],
  },
  {
    classSectionId: "hk1-2026-comp1080-01",
    courseCode: "COMP1080",
    courseName: "Trí tuệ nhân tạo",
    status: "draft",
    publishedAt: null,
    updatedAt: mockDate(-3, "22:10"),
    description: "Các phương pháp tìm kiếm, biểu diễn tri thức, suy luận và nhập môn học máy.",
    outcomes: [
      { code: "CLO1", text: "Mô hình hóa bài toán dưới dạng không gian trạng thái" },
      { code: "CLO2", text: "Cài đặt các thuật toán tìm kiếm và suy diễn" },
      { code: "CLO3", text: "Áp dụng mô hình học máy đơn giản" },
    ],
    weeks: weeksOf("COMP1080"),
    assessments: [
      { key: "attendance", label: "Chuyên cần", weight: 10, method: "Điểm danh", outcomes: ["CLO1"] },
      { key: "midterm", label: "Giữa kỳ", weight: 20, method: "Tự luận 60 phút", outcomes: ["CLO1", "CLO2"] },
      { key: "final", label: "Cuối kỳ", weight: 60, method: "Tự luận 90 phút", outcomes: ["CLO1", "CLO2", "CLO3"] },
    ],
    references: ["Russell và Norvig, Artificial Intelligence: A Modern Approach, 4th edition"],
  },
];

const ME = mockLecturerIdentity(0).displayName;

export const CLASS_ANNOUNCEMENTS: ClassAnnouncement[] = [
  { id: "tbl-01", classSectionId: "hk1-2026-comp1020-01", title: "Đề cương và lịch kiểm tra giữa kỳ", body: "Kiểm tra giữa kỳ vào tuần 8, nội dung từ chương 1 đến chương 6. Được mang một tờ A4 ghi chú viết tay.", isPinned: true, sendEmail: true, status: "published", publishAt: mockDate(-30, "09:00"), author: ME, readCount: 39 },
  { id: "tbl-02", classSectionId: "hk1-2026-comp1020-01", title: "Bài tập tuần 6: sắp xếp trộn", body: "Nộp bài trên hệ thống trước 23:59 chủ nhật. Bài nộp trễ trừ 20% điểm.", isPinned: false, sendEmail: false, status: "published", publishAt: mockDate(-6, "19:30"), author: ME, readCount: 31 },
  { id: "tbl-03", classSectionId: "hk1-2026-comp1020-01", title: "Nghỉ buổi thứ 2 tuần sau, dạy bù thứ 7", body: "Giảng viên đi hội thảo. Buổi dạy bù thứ 7, tiết 1-3, phòng B.405.", isPinned: false, sendEmail: true, status: "scheduled", publishAt: mockDate(1, "07:00"), author: ME, readCount: 0 },
  { id: "tbl-04", classSectionId: "hk1-2026-comp1070-01", title: "Chia nhóm đồ án", body: "Mỗi nhóm 4 bạn, đăng ký tên nhóm và đề tài trong biểu mẫu trước thứ 6.", isPinned: true, sendEmail: true, status: "published", publishAt: mockDate(-35, "10:00"), author: ME, readCount: 40 },
  { id: "tbl-05", classSectionId: "hk1-2026-comp1080-01", title: "Tài liệu chương 4 đã cập nhật", body: "Slide tìm kiếm A* có thêm ví dụ bản đồ TP.HCM.", isPinned: false, sendEmail: false, status: "published", publishAt: mockDate(-2, "21:00"), author: ME, readCount: 22 },
];
