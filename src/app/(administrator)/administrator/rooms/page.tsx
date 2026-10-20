import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { requirePermission } from "@/modules/access/access.query";
import { getClassSections, getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { RoomTable } from "@/modules/facilities/components/room-table";
import type { RoomBooking } from "@/modules/facilities/components/room-week-grid";
import { getCampuses, getRooms } from "@/modules/facilities/facilities.query";

export const metadata: Metadata = { title: "Phòng học" };

export default async function Page() {
  const viewer = await requirePermission("facilities.manage");
  const term = await getCurrentTerm();
  const [rooms, campuses, sections] = await Promise.all([getRooms(), getCampuses(), getClassSections(term.id)]);
  const bookings: Record<string, RoomBooking[]> = {};
  for (const section of sections) {
    if (section.status === "cancelled") continue;
    for (const meeting of section.meetings) {
      bookings[meeting.room] = [...(bookings[meeting.room] ?? []), { code: section.code, courseName: section.courseName, ...meeting }];
    }
    // Nhóm thực hành cũng chiếm phòng.
    for (const group of section.labGroups) {
      bookings[group.meeting.room] = [...(bookings[group.meeting.room] ?? []), { code: group.code, courseName: `${section.courseName} (thực hành)`, ...group.meeting }];
    }
  }
  const maintenance = rooms.filter((room) => room.status === "maintenance").length;

  return (
    <>
      <PageHeader
        title="Phòng học"
        description={`${rooms.length} phòng tại ${campuses.length} cơ sở${maintenance > 0 ? `, ${maintenance} phòng đang bảo trì` : ""}. Mở từng phòng để xem lịch sử dụng theo tuần và sửa thông tin.`}
      />
      <RoomTable rooms={rooms} campuses={campuses} bookings={bookings} termName={term.shortName} canManage={viewer.faculty === null} />
    </>
  );
}
