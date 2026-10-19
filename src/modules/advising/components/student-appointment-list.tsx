import { Card } from "antd";
import { Clock, DoorOpen, Envelope, Phone } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, formatDate, weekdayOf } from "@/shared/libs/date.lib";
import { APPOINTMENT_MODE_LABEL, STUDENT_APPOINTMENT_STATUS } from "@/modules/advising/advising.constant";
import type { StudentAdvisor, StudentAppointment } from "@/modules/advising/advising.type";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

function timeRange(appointment: StudentAppointment) {
  const end = dayjs(`${appointment.date}T${appointment.startTime}`).add(appointment.durationMinutes, "minute");
  return `${appointment.startTime} - ${end.format("HH:mm")}`;
}

function AppointmentItem({ appointment, isPast }: { appointment: StudentAppointment; isPast: boolean }) {
  const showStatus = appointment.status !== "scheduled" || isPast;
  return (
    <Card size="small">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex shrink-0 flex-col sm:w-40">
          <span className="font-medium">
            {weekdayLabel(weekdayOf(appointment.date))}, {formatDate(appointment.date)}
          </span>
          <span className="text-sm text-muted tabular-nums">{timeRange(appointment)}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-pretty">{appointment.topic}</span>
            {showStatus && (
              <StatusTag status={appointment.status === "scheduled" ? { label: "Đã qua giờ hẹn", tone: "neutral" } : STUDENT_APPOINTMENT_STATUS[appointment.status]} />
            )}
          </span>
          <span className="min-w-0 text-sm text-muted">
            {APPOINTMENT_MODE_LABEL[appointment.mode]} ·{" "}
            {isUrl(appointment.location) && !isPast ? (
              <a href={appointment.location} target="_blank" rel="noreferrer" className="break-all">
                {appointment.location}
              </a>
            ) : (
              <span className="break-words">{appointment.location}</span>
            )}
          </span>
          <span className="text-xs text-muted">
            {appointment.advisor} · {appointment.durationMinutes} phút
            {appointment.inviteeCount > 1 ? ` · buổi chung ${appointment.inviteeCount} sinh viên` : ""}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function StudentAppointmentList({ upcoming, past }: { upcoming: StudentAppointment[]; past: StudentAppointment[] }) {
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <SectionCard title="Sắp tới" flush={upcoming.length === 0}>
        {upcoming.length === 0 ? (
          <EmptyState illustration="calendar" title="Chưa có buổi hẹn sắp tới" description="Khi cố vấn hẹn gặp, buổi hẹn hiện ở đây và trong chuông thông báo." />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((appointment) => (
              <li key={appointment.id}>
                <AppointmentItem appointment={appointment} isPast={false} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Đã qua" flush={past.length === 0}>
        {past.length === 0 ? (
          <EmptyState illustration="document" title="Chưa có buổi hẹn nào đã qua" />
        ) : (
          <ul className="flex flex-col gap-3">
            {past.map((appointment) => (
              <li key={appointment.id}>
                <AppointmentItem appointment={appointment} isPast />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

export function AdvisorContactCard({ advisor }: { advisor: StudentAdvisor | null }) {
  return (
    <SectionCard title="Cố vấn học tập">
      {advisor ? (
        <div className="flex flex-col gap-2 text-sm">
          <span className="flex flex-col">
            <span className="font-medium">{advisor.displayName}</span>
            <span className="text-xs text-muted">Cố vấn lớp {advisor.className}</span>
          </span>
          <a href={`mailto:${advisor.email}`} className="flex min-w-0 items-center gap-2 break-all">
            <Envelope size={16} aria-hidden className="shrink-0 text-zinc-500" />
            {advisor.email}
          </a>
          {advisor.phone && (
            <a href={`tel:${advisor.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 tabular-nums">
              <Phone size={16} aria-hidden className="shrink-0 text-zinc-500" />
              {advisor.phone}
            </a>
          )}
          {advisor.office && (
            <span className="flex items-start gap-2">
              <DoorOpen size={16} aria-hidden className="mt-0.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 text-pretty">{advisor.office}</span>
            </span>
          )}
          {advisor.officeHours && (
            <span className="flex items-start gap-2">
              <Clock size={16} aria-hidden className="mt-0.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 text-pretty">Tiếp sinh viên: {advisor.officeHours}</span>
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Lớp sinh hoạt của bạn chưa được phân công cố vấn. Liên hệ văn phòng khoa.</p>
      )}
    </SectionCard>
  );
}
