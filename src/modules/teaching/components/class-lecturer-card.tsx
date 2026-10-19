import { Clock, DoorOpen, Envelope } from "defeat-icons-react";
import { SectionCard } from "@/shared/components/ui/section-card";
import type { ClassLecturer } from "@/modules/teaching/teaching.type";

export function ClassLecturerCard({ lecturer }: { lecturer: ClassLecturer | null }) {
  return (
    <SectionCard title="Giảng viên">
      {lecturer ? (
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{lecturer.displayName}</span>
          <a href={`mailto:${lecturer.email}`} className="flex min-w-0 items-center gap-2 break-all">
            <Envelope size={16} aria-hidden className="shrink-0 text-zinc-500" />
            {lecturer.email}
          </a>
          {lecturer.office && (
            <span className="flex items-start gap-2">
              <DoorOpen size={16} aria-hidden className="mt-0.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 text-pretty">{lecturer.office}</span>
            </span>
          )}
          {lecturer.officeHours && (
            <span className="flex items-start gap-2">
              <Clock size={16} aria-hidden className="mt-0.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 text-pretty">Tiếp sinh viên: {lecturer.officeHours}</span>
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Lớp chưa được phân công giảng viên.</p>
      )}
    </SectionCard>
  );
}
