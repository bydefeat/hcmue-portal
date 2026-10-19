import { dayjs } from "@/shared/libs/date.lib";
import { mockDate, mockId, mockLecturerIdentity, mockStudentIdentity } from "@/shared/libs/mock.lib";
import { ADVISOR_ASSIGNMENTS } from "@/modules/users/users.mock";
import { REQUEST_KINDS } from "@/modules/requests/requests.constant";
import type { AcademicRequest, ApprovalStep, RequestAttachment, RequestDetail, RequestKind } from "@/modules/requests/requests.type";

const OFFICERS = { faculty: "Võ Thanh Trang", "academic-office": "Nguyễn Thị Thu Hà", "exam-office": "Huỳnh Văn Sơn" } as const;

type Seed = {
  kind: RequestKind;
  student?: number;
  lecturer?: number;
  handlerLecturer?: number;
  subject: string;
  details: RequestDetail[];
  reason: string;
  attachments?: string[];
  daysAgo: number;
  approved: number;
  rejectedComment?: string;
  cancelled?: boolean;
  comments?: string[];
};

function buildSteps(seed: Seed, createdAt: string, advisor: { id: string; name: string } | null): ApprovalStep[] {
  const config = REQUEST_KINDS[seed.kind];
  let cursor = dayjs(createdAt);
  return config.steps.map((template, index) => {
    const lecturer = seed.handlerLecturer !== undefined ? mockLecturerIdentity(seed.handlerLecturer) : null;
    const assignee =
      template.role === "advisor"
        ? advisor
        : template.role === "lecturer" && lecturer
          ? { id: lecturer.id, name: lecturer.displayName }
          : template.role === "lecturer"
            ? null
            : { id: null, name: OFFICERS[template.role] };
    const base = { role: template.role, label: template.label, assigneeId: assignee?.id ?? null, assigneeName: assignee?.name ?? null };
    if (seed.cancelled && index >= seed.approved) {
      return { ...base, status: "waiting" as const, actorName: null, actedAt: null, comment: null, dueAt: null };
    }
    if (index < seed.approved) {
      cursor = cursor.add(1 + (index % 2), "day").hour(9 + index * 2);
      return {
        ...base,
        status: "approved" as const,
        actorName: assignee?.name ?? "Cán bộ xử lý",
        actedAt: cursor.toISOString(),
        comment: seed.comments?.[index] ?? null,
        dueAt: null,
      };
    }
    if (index === seed.approved && seed.rejectedComment) {
      return {
        ...base,
        status: "rejected" as const,
        actorName: assignee?.name ?? "Cán bộ xử lý",
        actedAt: cursor.add(2, "day").toISOString(),
        comment: seed.rejectedComment,
        dueAt: null,
      };
    }
    if (index === seed.approved && !seed.rejectedComment) {
      return { ...base, status: "pending" as const, actorName: null, actedAt: null, comment: null, dueAt: cursor.add(template.slaDays, "day").toISOString() };
    }
    return { ...base, status: "waiting" as const, actorName: null, actedAt: null, comment: null, dueAt: null };
  });
}

// Minh chứng mẫu đều là PDF; seed ghi một tệp PDF nhỏ cho mỗi tệp và lưu kích thước thật của tệp đó.
function attachmentsOf(seed: Seed, index: number): RequestAttachment[] {
  return (seed.attachments ?? []).map((fileName, position) => ({
    id: mockId(`request:${index + 1}:attachment:${position + 1}`),
    fileName,
    contentType: "application/pdf",
    sizeBytes: 0,
  }));
}

function build(seed: Seed, index: number): AcademicRequest {
  const createdAt = mockDate(-seed.daysAgo, `${8 + (index % 9)}:${String((index * 7) % 60).padStart(2, "0")}`);
  const year = 2026;
  if (seed.student !== undefined) {
    const student = mockStudentIdentity(seed.student);
    // Cố vấn đúng như phân công lớp sinh hoạt trong dữ liệu mẫu của module users.
    const assignment = ADVISOR_ASSIGNMENTS.find((entry) => entry.className === student.className);
    const advisor = assignment?.advisorId ? { id: assignment.advisorId, name: assignment.advisorName ?? "" } : null;
    return {
      id: mockId(`request:${index + 1}`),
      code: `DT-${year}-${String(1240 + index * 3).padStart(5, "0")}`,
      kind: seed.kind,
      requesterType: "student",
      requesterId: student.id,
      requesterName: student.fullName,
      requesterCode: student.code,
      requesterUnit: student.className,
      faculty: student.faculty,
      subject: seed.subject,
      details: seed.details,
      reason: seed.reason,
      attachments: attachmentsOf(seed, index),
      createdAt,
      cancelledAt: seed.cancelled ? mockDate(-seed.daysAgo + 1, "10:00") : null,
      steps: buildSteps(seed, createdAt, advisor),
    };
  }
  const lecturer = mockLecturerIdentity(seed.lecturer ?? 0);
  return {
    id: mockId(`request:${index + 1}`),
    code: `GV-${year}-${String(310 + index * 2).padStart(5, "0")}`,
    kind: seed.kind,
    requesterType: "lecturer",
    requesterId: lecturer.id,
    requesterName: lecturer.displayName,
    requesterCode: lecturer.code,
    requesterUnit: lecturer.faculty,
    faculty: lecturer.faculty,
    subject: seed.subject,
    details: seed.details,
    reason: seed.reason,
    attachments: attachmentsOf(seed, index),
    createdAt,
    cancelledAt: seed.cancelled ? mockDate(-seed.daysAgo + 1, "10:00") : null,
    steps: buildSteps(seed, createdAt, null),
  };
}

const SEEDS: Seed[] = [
  {
    kind: "overload",
    student: 12,
    subject: "Học kỳ 2, năm học 2026-2027",
    details: [
      { label: "Số tín chỉ xin đăng ký", value: "28" },
      { label: "CPA hiện tại", value: "3,71" },
      { label: "Học phần thêm", value: "COMP1120 An toàn và bảo mật thông tin" },
    ],
    reason: "Em muốn học trước An toàn và bảo mật thông tin để kịp đi thực tập ở học kỳ 1 năm sau.",
    daysAgo: 4,
    approved: 1,
    comments: ["Sinh viên học lực xuất sắc, đồng ý."],
  },
  {
    kind: "transcript",
    student: 12,
    subject: "Bảng điểm tiếng Việt và tiếng Anh",
    details: [
      { label: "Số bản", value: "2 bản tiếng Việt, 1 bản tiếng Anh" },
      { label: "Hình thức nhận", value: "Nhận trực tiếp tại Phòng Đào tạo" },
    ],
    reason: "Nộp hồ sơ học bổng trao đổi sinh viên.",
    daysAgo: 20,
    approved: 1,
    comments: ["Đã in, sinh viên nhận tại phòng A.102."],
  },
  {
    kind: "exam-postpone",
    student: 12,
    handlerLecturer: 1,
    subject: "MATH1013 Xác suất thống kê, thi giữa kỳ",
    details: [{ label: "Ngày thi", value: "Thứ 4 tuần sau" }],
    reason: "Trùng lịch thi đấu giải bóng chuyền sinh viên toàn quốc, có giấy triệu tập của Đoàn trường.",
    attachments: ["giay-trieu-tap.pdf"],
    daysAgo: 1,
    approved: 0,
    cancelled: true,
  },
  {
    kind: "overload",
    student: 54,
    subject: "Học kỳ 2, năm học 2026-2027",
    details: [
      { label: "Số tín chỉ xin đăng ký", value: "27" },
      { label: "CPA hiện tại", value: "3,60" },
    ],
    reason: "Em học bù học phần Mạng máy tính bị hoãn ở học kỳ trước.",
    daysAgo: 2,
    approved: 0,
  },
  {
    kind: "withdraw",
    student: 6,
    subject: "COMP1080.01 Trí tuệ nhân tạo",
    details: [{ label: "Lớp học phần", value: "COMP1080.01" }],
    reason: "Em đang nợ Xác suất thống kê, học tiếp sẽ không theo kịp.",
    daysAgo: 6,
    approved: 0,
  },
  {
    kind: "reserve",
    student: 60,
    subject: "Bảo lưu học kỳ 2, năm học 2026-2027",
    details: [
      { label: "Thời gian bảo lưu", value: "1 học kỳ" },
      { label: "Lý do", value: "Điều trị bệnh dài ngày" },
    ],
    reason: "Em phải điều trị tại Bệnh viện Chợ Rẫy, có giấy xác nhận của bệnh viện.",
    attachments: ["giay-xac-nhan-benh-vien.pdf"],
    daysAgo: 3,
    approved: 0,
  },
  {
    kind: "open-class",
    student: 102,
    subject: "COMP1031 Lập trình hướng đối tượng, học kỳ 2",
    details: [
      { label: "Học phần", value: "COMP1031 Lập trình hướng đối tượng" },
      { label: "Số sinh viên cùng đề nghị", value: "37" },
    ],
    reason: "Lớp COMP1031.01 đã đủ 45/45 chỗ, còn nhiều bạn khóa 49 chưa đăng ký được.",
    daysAgo: 5,
    approved: 1,
    comments: ["Khoa bố trí ThS. giảng dạy, đề nghị mở lớp 03."],
  },
  {
    kind: "open-class",
    student: 18,
    subject: "MATH2001 Giải tích 2, học kỳ 2",
    details: [
      { label: "Học phần", value: "MATH2001 Giải tích 2" },
      { label: "Số sinh viên cùng đề nghị", value: "22" },
    ],
    reason: "Lớp hiện có học buổi tối, nhiều bạn không đi được.",
    daysAgo: 9,
    approved: 0,
  },
  {
    kind: "overload",
    student: 30,
    subject: "Học kỳ 2, năm học 2026-2027",
    details: [
      { label: "Số tín chỉ xin đăng ký", value: "29" },
      { label: "CPA hiện tại", value: "2,10" },
    ],
    reason: "Em muốn ra trường đúng hạn.",
    daysAgo: 8,
    approved: 1,
    rejectedComment: "CPA dưới 2,5 nên không đủ điều kiện học vượt. Đăng ký tối đa 25 tín chỉ.",
  },
  {
    kind: "regrade",
    student: 156,
    handlerLecturer: 0,
    subject: "COMP1070.01 Phát triển ứng dụng web, cuối kỳ",
    details: [
      { label: "Điểm hiện tại", value: "4,5" },
      { label: "Lớp học phần", value: "COMP1070.01" },
    ],
    reason: "Em làm đủ 4 câu nhưng câu 3 được 0 điểm, xin chấm lại.",
    daysAgo: 4,
    approved: 1,
  },
  {
    kind: "regrade",
    student: 216,
    handlerLecturer: 0,
    subject: "COMP1070.01 Phát triển ứng dụng web, cuối kỳ",
    details: [
      { label: "Điểm hiện tại", value: "6,0" },
      { label: "Lớp học phần", value: "COMP1070.01" },
    ],
    reason: "Em nghĩ phần đồ án chưa được cộng điểm báo cáo.",
    daysAgo: 3,
    approved: 1,
  },
  {
    kind: "regrade",
    student: 37,
    handlerLecturer: 7,
    subject: "MATH1013 Xác suất thống kê, cuối kỳ học kỳ 2",
    details: [
      { label: "Điểm cũ", value: "3,5" },
      { label: "Điểm sau phúc khảo", value: "4,25" },
    ],
    reason: "Xin chấm lại câu 2.",
    daysAgo: 30,
    approved: 3,
    comments: ["Đã tiếp nhận.", "Cộng 0,75 điểm câu 2b do chấm sót.", "Đã cập nhật điểm."],
  },
  {
    kind: "exam-postpone",
    student: 74,
    handlerLecturer: 0,
    subject: "COMP1020.02 Cấu trúc dữ liệu và giải thuật, thi giữa kỳ",
    details: [{ label: "Ngày thi", value: "Tuần sau" }],
    reason: "Em đi thi Olympic Tin học sinh viên tại Hà Nội.",
    attachments: ["quyet-dinh-cu-doan-thi.pdf"],
    daysAgo: 1,
    approved: 0,
  },
  {
    kind: "withdraw",
    student: 41,
    subject: "LITR1020.01 Lý luận văn học",
    details: [{ label: "Lớp học phần", value: "LITR1020.01" }],
    reason: "Trùng giờ đi làm thêm.",
    daysAgo: 12,
    approved: 2,
  },
  {
    kind: "transcript",
    student: 99,
    subject: "Bảng điểm tiếng Anh",
    details: [{ label: "Số bản", value: "3" }],
    reason: "Xin việc.",
    daysAgo: 2,
    approved: 0,
  },
  {
    kind: "reserve",
    student: 133,
    subject: "Bảo lưu học kỳ 2, năm học 2026-2027",
    details: [{ label: "Thời gian bảo lưu", value: "2 học kỳ" }],
    reason: "Gia đình khó khăn, em cần đi làm một thời gian.",
    daysAgo: 11,
    approved: 2,
  },
  {
    kind: "open-class",
    student: 147,
    subject: "PSYC2010 Tham vấn tâm lý học đường",
    details: [{ label: "Số sinh viên cùng đề nghị", value: "18" }],
    reason: "Học phần tự chọn chưa mở 2 học kỳ liền.",
    daysAgo: 7,
    approved: 0,
  },
  {
    kind: "credit-transfer",
    student: 42,
    subject: "Công nhận học phần khi chuyển ngành sang Sư phạm Toán học",
    details: [
      { label: "Học phần đã học", value: "PHYS1001 Cơ học, 3 TC, điểm 7,8" },
      { label: "Học phần xin công nhận", value: "MATH1011 Giải tích 1, 3 TC" },
      { label: "Nơi học", value: "Khoa Vật lý, HCMUE" },
    ],
    reason: "Em đã chuyển ngành theo quyết định của Trường, xin công nhận các học phần nền tảng đã học.",
    attachments: ["bang-diem-khoa-vat-ly.pdf", "de-cuong-co-hoc.pdf"],
    daysAgo: 6,
    approved: 0,
  },
  {
    kind: "credit-transfer",
    student: 222,
    subject: "Công nhận Tiếng Anh 1, 2 bằng chứng chỉ IELTS 6.5",
    details: [
      { label: "Chứng chỉ", value: "IELTS Academic 6.5, còn hạn đến 03/2028" },
      { label: "Học phần xin công nhận", value: "ENGL1001, ENGL1002" },
    ],
    reason: "Theo quy định miễn học ngoại ngữ không chuyên khi có chứng chỉ tương đương B2.",
    attachments: ["ielts.pdf"],
    daysAgo: 14,
    approved: 2,
    comments: ["Chứng chỉ hợp lệ, đủ điều kiện.", "Đã ghi điểm miễn (M) cho 2 học phần."],
  },
  {
    kind: "grade-change",
    lecturer: 0,
    subject: "COMP1070.01 Phát triển ứng dụng web",
    details: [
      { label: "Sinh viên", value: "Ngô Thu Quỳnh, 50.01.104.108" },
      { label: "Cột điểm", value: "Đồ án" },
      { label: "Điểm cũ", value: "6,5" },
      { label: "Điểm mới", value: "8,5" },
    ],
    reason: "Nhập nhầm điểm đồ án của hai sinh viên cùng nhóm.",
    attachments: ["bien-ban-cham-do-an.pdf"],
    daysAgo: 2,
    approved: 0,
  },
  {
    kind: "teaching-leave",
    lecturer: 0,
    subject: "COMP1020.01, thứ 2 tuần sau",
    details: [
      { label: "Buổi nghỉ", value: "Thứ 2, tiết 1-3, phòng B.405" },
      { label: "Dạy bù", value: "Thứ 7, tiết 1-3, đề xuất phòng B.405" },
    ],
    reason: "Đi hội thảo khoa học tại Đại học Quốc gia Hà Nội.",
    daysAgo: 5,
    approved: 2,
    comments: ["Khoa đồng ý.", "Đã xếp phòng B.405 thứ 7 tiết 1-3."],
  },
  {
    kind: "teaching-leave",
    lecturer: 12,
    subject: "COMP1060.01, thứ 5",
    details: [
      { label: "Buổi nghỉ", value: "Thứ 5, tiết 7-9" },
      { label: "Dạy bù", value: "Chủ nhật, tiết 1-3" },
    ],
    reason: "Coi thi tuyển sinh sau đại học.",
    daysAgo: 1,
    approved: 1,
  },
  {
    kind: "grade-change",
    lecturer: 7,
    subject: "MATH1013.01 Xác suất thống kê",
    details: [
      { label: "Sinh viên", value: "Lê Văn Hiếu, 51.01.104.010" },
      { label: "Cột điểm", value: "Cuối kỳ" },
      { label: "Điểm cũ", value: "3,5" },
      { label: "Điểm mới", value: "4,25" },
    ],
    reason: "Điều chỉnh sau phúc khảo.",
    daysAgo: 6,
    approved: 1,
  },
];

export const REQUESTS: AcademicRequest[] = SEEDS.map(build);
