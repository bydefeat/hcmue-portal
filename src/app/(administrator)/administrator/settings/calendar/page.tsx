import type { Metadata } from "next";
import { requirePermission } from "@/modules/access/access.query";
import { getCurrentTerm, getTerms } from "@/modules/course-registration/course-registration.query";
import { AcademicCalendar } from "@/modules/settings/components/academic-calendar";
import { getCalendarEvents } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Lịch năm học" };

export default async function Page() {
  await requirePermission("settings.manage");
  const [events, terms, currentTerm] = await Promise.all([getCalendarEvents(), getTerms(), getCurrentTerm()]);
  const termIds = new Set(events.map((event) => event.termId));
  return (
    <AcademicCalendar
      header={{
        title: "Lịch năm học",
        description: "Các mốc học, thi, đăng ký, nhập điểm và nghỉ lễ. Lịch hiện trên cổng sinh viên và giảng viên ngay khi lưu.",
      }}
      events={events}
      terms={terms.filter((term) => termIds.has(term.id)).map((term) => ({ id: term.id, name: term.shortName }))}
      defaultTermId={currentTerm.id}
    />
  );
}
