import { z } from "zod";
import type { Dayjs } from "dayjs";
import { dayjs } from "@/shared/libs/date.lib";

// Dùng chung cho form đặt lịch và server action; DB còn chặn bằng advising_appointments_duration_range.
export const APPOINTMENT_SCHEMA = z.object({
  studentIds: z
    .array(z.uuid("Sinh viên không hợp lệ"))
    .min(1, "Chọn ít nhất một sinh viên")
    .max(60, "Tối đa 60 sinh viên một buổi hẹn")
    .transform((ids) => [...new Set(ids)]),
  topic: z.string().trim().min(1, "Chưa nhập nội dung").max(200, "Tối đa 200 ký tự"),
  date: z.iso.date("Chọn ngày").refine((value) => !dayjs(value).isBefore(dayjs().startOf("day")), "Không hẹn vào ngày đã qua"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Chọn giờ"),
  durationMinutes: z.int("Chọn thời lượng").min(5, "Ít nhất 5 phút").max(240, "Tối đa 240 phút"),
  mode: z.enum(["in-person", "online"]),
  location: z.string().trim().min(1, "Chưa nhập địa điểm").max(200, "Tối đa 200 ký tự"),
});

export type AppointmentInput = z.input<typeof APPOINTMENT_SCHEMA>;

export const APPOINTMENT_DONE_SCHEMA = z.object({
  id: z.uuid(),
  note: z.string().trim().min(1, "Ghi lại nội dung chính đã trao đổi").max(1000, "Tối đa 1000 ký tự"),
  followUp: z
    .string()
    .trim()
    .max(300, "Tối đa 300 ký tự")
    .nullish()
    .transform((value) => value || null),
});

export type AppointmentDoneInput = z.input<typeof APPOINTMENT_DONE_SCHEMA>;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Hai buổi hẹn cùng ngày chồng giờ nhau (giờ dạng "HH:mm").
export function appointmentsOverlap(a: { date: string; startTime: string; durationMinutes: number }, b: { date: string; startTime: string; durationMinutes: number }) {
  if (a.date !== b.date) return false;
  const aStart = minutesOf(a.startTime);
  const bStart = minutesOf(b.startTime);
  return aStart < bStart + b.durationMinutes && bStart < aStart + a.durationMinutes;
}

// Chia lịch hẹn của sinh viên: sắp tới là buổi còn "đã hẹn" và chưa kết thúc (sớm nhất trước); còn lại là đã qua (gần nhất trước).
export function splitAppointments<T extends { date: string; startTime: string; durationMinutes: number; status: string }>(appointments: T[], now: Dayjs) {
  const endOf = (appointment: T) => dayjs(`${appointment.date}T${appointment.startTime}`).add(appointment.durationMinutes, "minute");
  const upcoming = appointments.filter((appointment) => appointment.status === "scheduled" && !endOf(appointment).isBefore(now));
  const past = appointments.filter((appointment) => !upcoming.includes(appointment));
  return {
    upcoming: upcoming.toSorted((a, b) => endOf(a).valueOf() - endOf(b).valueOf()),
    past: past.toSorted((a, b) => endOf(b).valueOf() - endOf(a).valueOf()),
  };
}
