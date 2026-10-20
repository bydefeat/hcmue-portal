import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { dayjs, hoursUntil } from "@/shared/libs/date.lib";
import type {
  ClassConflict,
  ClassMeeting,
  ClassSection,
  ClassSectionStatus,
  HoldKind,
  RegistrationEventKind,
  RegistrationPeriod,
  RegistrationPeriodState,
  RegistrationPeriodView,
  ReservedSeat,
  SectionAudience,
} from "@/modules/course-registration/course-registration.type";

// Mặc định khi chưa đọc được quy chế; số giờ "sắp đóng" thật lấy từ quy chế (workflow.registrationClosingSoonHours).
export const DEFAULT_CLOSING_SOON_HOURS = 48;

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


export function overlaps(a: ClassMeeting, b: ClassMeeting) {
  return a.dayOfWeek === b.dayOfWeek && a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

export function allMeetings(section: Pick<ClassSection, "meetings" | "labGroups">) {
  return [...section.meetings, ...section.labGroups.map((group) => group.meeting)];
}

// Trùng phòng và trùng giờ giảng viên (giảng viên dạy cả buổi lý thuyết lẫn nhóm thực hành của lớp), cùng tiêu chí với server khi lưu
// lớp, phân công giảng viên. Phải truyền đủ lớp của cả học kỳ (mọi khoa) để không sót trùng phòng với lớp khoa khác.
export function conflictsOf(section: Pick<ClassSection, "id" | "status" | "lecturerId" | "meetings" | "labGroups">, siblings: Pick<ClassSection, "id" | "code" | "status" | "lecturerId" | "meetings" | "labGroups">[]): ClassConflict[] {
  if (section.status === "cancelled") return [];
  const conflicts: ClassConflict[] = [];
  for (const other of siblings) {
    if (other.id === section.id || other.status === "cancelled") continue;
    let room = false;
    let lecturer = false;
    for (const mine of allMeetings(section)) {
      for (const theirs of allMeetings(other)) {
        if (!overlaps(mine, theirs)) continue;
        const when = `${weekdayLabel(mine.dayOfWeek)}, ${periodLabel(theirs.startPeriod, theirs.endPeriod)}`;
        if (!room && mine.room === theirs.room) {
          room = true;
          conflicts.push({ kind: "room", withCode: other.code, message: `Trùng phòng ${mine.room} với ${other.code} (${when})` });
        }
        if (!lecturer && section.lecturerId && section.lecturerId === other.lecturerId) {
          lecturer = true;
          conflicts.push({ kind: "lecturer", withCode: other.code, message: `Giảng viên đã dạy ${other.code} cùng giờ (${when})` });
        }
      }
    }
  }
  return conflicts;
}

export function periodState(period: RegistrationPeriod, closingSoonHours = DEFAULT_CLOSING_SOON_HOURS): RegistrationPeriodView {
  const now = dayjs();
  const hoursLeft = hoursUntil(period.closesAt);
  if (now.isBefore(period.opensAt)) return { ...period, state: "upcoming", hoursLeft };
  if (now.isAfter(period.closesAt)) return { ...period, state: "closed", hoursLeft };
  return { ...period, state: hoursLeft <= closingSoonHours ? "closing" : "open", hoursLeft };
}

export function meetingText(meeting: ClassMeeting) {
  return `${weekdayLabel(meeting.dayOfWeek)}, ${periodLabel(meeting.startPeriod, meeting.endPeriod)} · ${meeting.room}`;
}

export function audienceText(audience: SectionAudience) {
  const parts = [
    audience.majorCodes.length > 0 ? `ngành ${audience.majorCodes.map((code, index) => audience.majorNames[index] ?? code).join(", ")}` : null,
    audience.cohorts.length > 0 ? `khóa ${audience.cohorts.join(", ")}` : null,
  ].filter(Boolean);
  return `Chỉ ${parts.join(", ")}`;
}

export function reservedText(seat: ReservedSeat) {
  return `${seat.label}: giữ ${seat.seats} chỗ, đã dùng ${seat.taken}`;
}

export const HOLD_KIND_LABEL: Record<HoldKind, string> = {
  tuition: "Học phí",
  discipline: "Kỷ luật",
  documents: "Hồ sơ",
  "academic-status": "Tình trạng học tập",
  advisor: "Cố vấn học tập",
};

export const HOLD_KIND_OPTIONS = (Object.keys(HOLD_KIND_LABEL) as HoldKind[]).map((value) => ({ value, label: HOLD_KIND_LABEL[value] }));

export const REGISTRATION_EVENT: Record<RegistrationEventKind, StatusMeta> = {
  add: { label: "Đăng ký", tone: "success" },
  drop: { label: "Hủy đăng ký", tone: "neutral" },
  swap: { label: "Đổi lớp", tone: "neutral" },
  waitlist: { label: "Vào danh sách chờ", tone: "warning" },
  "waitlist-promoted": { label: "Được xếp từ danh sách chờ", tone: "success" },
  "waitlist-expired": { label: "Lượt chờ hết hạn", tone: "neutral" },
  "admin-add": { label: "Phòng Đào tạo đăng ký hộ", tone: "warning" },
  "admin-drop": { label: "Phòng Đào tạo hủy hộ", tone: "warning" },
  "section-cancelled": { label: "Lớp bị hủy", tone: "danger" },
};

export function keepCurrencyTogether(value: string) {
  return value.replace(/ đ(?=[\s,.)]|$)/g, "\u00a0đ");
}

export const REGISTRATION_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  class_sections_enrolled_within_capacity: "Lớp đã đủ chỗ. Chọn lớp khác của học phần hoặc vào danh sách chờ.",
  lab_groups_enrolled_within_capacity: "Nhóm thực hành đã đủ chỗ, chọn nhóm khác.",
  reserved_seats_taken_within_seats: "Chỗ dành riêng cho đối tượng của bạn đã hết.",
  enrollments_active_per_section: "Bạn đã đăng ký lớp này.",
  enrollments_active_per_course_term: "Bạn đã đăng ký một lớp khác của học phần này trong học kỳ. Hủy lớp đó trước khi đổi lớp.",
  enrollments_lab_group_fk: "Nhóm thực hành không thuộc lớp đã chọn.",
  enrollments_class_section_fk: "Lớp học phần không còn tồn tại hoặc không thuộc học kỳ đang đăng ký.",
  waitlist_entries_single_waiting: "Bạn đã ở trong danh sách chờ của lớp này.",
  registration_holds_single_active: "Sinh viên đang có một khóa đăng ký cùng loại chưa gỡ.",
  class_sections_term_id_code_unique: "Mã lớp học phần đã có trong học kỳ.",
  class_sections_term_id_course_id_section_number_unique: "Số thứ tự lớp đã có cho học phần này trong học kỳ.",
  class_sections_min_enrollment_range: "Sĩ số tối thiểu phải từ 0 đến sĩ số tối đa.",
  lab_groups_class_section_id_code_unique: "Mã nhóm thực hành đã có trong lớp.",
  section_meetings_period_range: "Tiết học phải trong khoảng 1 đến 12, tiết bắt đầu không sau tiết kết thúc.",
  terms_single_current: "Đã có học kỳ khác được đánh dấu là học kỳ hiện tại.",
  terms_single_registration_target: "Đã có học kỳ khác đang nhận đăng ký.",
  registration_periods_time_order: "Thời điểm đóng đợt phải sau thời điểm mở.",
  registration_periods_credit_range: "Số tín chỉ tối thiểu không được lớn hơn tối đa.",
  enrollments_section_not_cancelled: "Lớp học phần đã hủy, không đăng ký được.",
  enrollments_lab_group_required: "Lớp có nhóm thực hành, chọn một nhóm trước khi đăng ký.",
  enrollments_reserved_seat_fk: "Chỗ dành riêng không thuộc lớp đã chọn.",
  reserved_seats_within_capacity: "Tổng chỗ dành riêng vượt sĩ số tối đa của lớp.",
  terms_no_overlap: "Thời gian học kỳ bị chồng lên một học kỳ khác.",
  terms_code_unique: "Mã học kỳ đã có.",
  terms_academic_year_semester_unique: "Năm học này đã có học kỳ cùng số thứ tự.",
  terms_date_order: "Ngày kết thúc học kỳ phải sau ngày bắt đầu.",
  class_sections_enrolled_only_when_open: "Lớp đang có sinh viên chỉ ở trạng thái mở; hủy lớp để rút sinh viên trước khi đổi trạng thái.",
  registration_holds_release_after_create: "Thời điểm gỡ khóa phải sau thời điểm khóa.",
};
