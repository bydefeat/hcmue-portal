import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { dayjs, hoursUntil } from "@/shared/libs/date.lib";
import type {
  ClassConflict,
  ClassMeeting,
  ClassSection,
  ClassSectionStatus,
  RegistrationPeriod,
  RegistrationPeriodState,
  RegistrationPeriodView,
} from "./course-registration.type";

export const CLOSING_SOON_HOURS = 48;

export const REGISTRATION_PERIOD_STATE: Record<RegistrationPeriodState, StatusMeta> = {
  upcoming: { label: "Sắp mở", tone: "neutral" },
  open: { label: "Đang mở", tone: "success" },
  closing: { label: "Sắp đóng", tone: "warning" },
  closed: { label: "Đã đóng", tone: "neutral" },
};

export const CLASS_SECTION_STATUS: Record<ClassSectionStatus, StatusMeta> = {
  draft: { label: "Nháp", tone: "neutral" },
  open: { label: "Mở đăng ký", tone: "success" },
  cancelled: { label: "Đã hủy", tone: "danger" },
};

export const CLASS_FULL_STATUS: StatusMeta = { label: "Đủ chỗ", tone: "warning" };

export const CLASS_SECTION_STATUS_OPTIONS = Object.entries(CLASS_SECTION_STATUS).map(([value, meta]) => ({
  value: value as ClassSectionStatus,
  label: meta.label,
}));

export const ROOMS = ["A.201", "A.203", "A.305", "B.302", "B.405", "B.408", "C.301 (Phòng máy)", "C.302 (Phòng máy)", "H.2.04", "H.3.11", "I.101 (Hội trường)"];

export function overlaps(a: ClassMeeting, b: ClassMeeting) {
  return a.dayOfWeek === b.dayOfWeek && a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

export function conflictsOf(section: ClassSection, siblings: ClassSection[]): ClassConflict[] {
  if (section.status === "cancelled") return [];
  const conflicts: ClassConflict[] = [];
  for (const other of siblings) {
    if (other.id === section.id || other.status === "cancelled") continue;
    for (const mine of section.meetings) {
      for (const theirs of other.meetings) {
        if (!overlaps(mine, theirs)) continue;
        const when = `${weekdayLabel(mine.dayOfWeek)}, ${periodLabel(theirs.startPeriod, theirs.endPeriod)}`;
        if (mine.room === theirs.room) {
          conflicts.push({ kind: "room", withCode: other.code, message: `Trùng phòng ${mine.room} với ${other.code} (${when})` });
        }
        if (section.lecturerId && section.lecturerId === other.lecturerId) {
          conflicts.push({ kind: "lecturer", withCode: other.code, message: `Giảng viên đã dạy ${other.code} cùng giờ (${when})` });
        }
      }
    }
  }
  return conflicts;
}

export function periodState(period: RegistrationPeriod): RegistrationPeriodView {
  const now = dayjs();
  const hoursLeft = hoursUntil(period.closesAt);
  if (now.isBefore(period.opensAt)) return { ...period, state: "upcoming", hoursLeft };
  if (now.isAfter(period.closesAt)) return { ...period, state: "closed", hoursLeft };
  return { ...period, state: hoursLeft <= CLOSING_SOON_HOURS ? "closing" : "open", hoursLeft };
}

export function meetingText(meeting: ClassMeeting) {
  return `${weekdayLabel(meeting.dayOfWeek)}, ${periodLabel(meeting.startPeriod, meeting.endPeriod)} · ${meeting.room}`;
}
