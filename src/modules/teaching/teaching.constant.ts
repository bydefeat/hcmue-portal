import type { StatusMeta } from "@/shared/constants/status.constant";
import type { ClassAnnouncementStatus, SyllabusAssessment, SyllabusStatus } from "./teaching.type";

export const SYLLABUS_STATUS: Record<SyllabusStatus, StatusMeta> = {
  draft: { label: "Bản nháp, sinh viên chưa thấy", tone: "warning" },
  published: { label: "Đã công bố cho sinh viên", tone: "success" },
};

export const CLASS_ANNOUNCEMENT_STATUS: Record<ClassAnnouncementStatus, StatusMeta> = {
  published: { label: "Đã đăng", tone: "neutral" },
  scheduled: { label: "Hẹn giờ đăng", tone: "warning" },
};

export const SYLLABUS_WEEKS = 15;

export function assessmentMismatches(assessments: SyllabusAssessment[], components: { key: string; label: string; weight: number }[]) {
  const messages: string[] = [];
  const total = assessments.reduce((sum, item) => sum + item.weight, 0);
  if (total !== 100) messages.push(`Tổng trọng số trong đề cương là ${total}%, cần đúng 100%.`);
  for (const component of components) {
    const match = assessments.find((item) => item.key === component.key);
    if (!match) messages.push(`Bảng điểm có cột "${component.label}" (${component.weight}%) nhưng đề cương chưa có.`);
    else if (match.weight !== component.weight) messages.push(`"${component.label}": đề cương ${match.weight}%, bảng điểm ${component.weight}%.`);
  }
  for (const item of assessments) {
    if (!components.some((component) => component.key === item.key)) messages.push(`Đề cương có "${item.label}" nhưng bảng điểm không có cột này.`);
  }
  return messages;
}
