import { createRandom, mockId, mockStudentIndex, pickOne } from "@/shared/libs/mock.lib";
import type { GraduationExtras } from "@/modules/graduation/graduation.type";
import type { CefrLevel } from "@/modules/settings/settings.type";

// Chứng chỉ ngoại ngữ mẫu kèm bậc khung tham chiếu châu Âu Phòng Đào tạo đã xác nhận.
const LANGUAGE: [string, CefrLevel][] = [
  ["VSTEP B1", "B1"],
  ["IELTS 5.5", "B2"],
  ["TOEIC 450", "A2"],
  ["VSTEP B2", "B2"],
  ["IELTS 6.5", "B2"],
];
// Đợt xét tốt nghiệp đang mở trong dữ liệu mẫu.
export const GRADUATION_ROUND = { id: mockId("graduation-round:2026-12"), name: "đợt tháng 12 năm 2026", cohorts: [48], isOpen: true };

const IT = ["Ứng dụng CNTT cơ bản", "MOS Word và Excel", "IC3"];

export function mockGraduationExtras(studentId: string): GraduationExtras {
  const index = mockStudentIndex(studentId);
  const random = createRandom(index * 53 + 11);
  const language = random() < 0.82 ? pickOne(random, LANGUAGE) : null;
  return {
    studentId,
    languageCertificate: language?.[0] ?? null,
    languageLevel: language?.[1] ?? null,
    itCertificate: random() < 0.9 ? pickOne(random, IT) : null,
  };
}
