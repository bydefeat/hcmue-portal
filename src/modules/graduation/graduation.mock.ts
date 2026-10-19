import { createRandom, mockStudentIndex, pickOne } from "@/shared/libs/mock.lib";
import type { GraduationExtras } from "@/modules/graduation/graduation.type";

const LANGUAGE = ["VSTEP B1", "IELTS 5.5", "TOEIC 550", "VSTEP B2", "IELTS 6.5"];
const IT = ["Ứng dụng CNTT cơ bản", "MOS Word và Excel", "IC3"];

export function mockGraduationExtras(studentId: string): GraduationExtras {
  const index = mockStudentIndex(studentId);
  const random = createRandom(index * 53 + 11);
  return {
    studentId,
    languageCertificate: random() < 0.82 ? pickOne(random, LANGUAGE) : null,
    itCertificate: random() < 0.9 ? pickOne(random, IT) : null,
    tuitionCleared: random() < 0.93,
    disciplineFree: random() < 0.97,
  };
}
