import { getClassRoster, getCurrentTerm, getLecturerClassSections } from "@/modules/course-registration/course-registration.query";
import type { ClassSectionView } from "@/modules/course-registration/course-registration.type";
import { getRooms } from "@/modules/facilities/facilities.query";
import { getGradeSheets } from "@/modules/grades/grades.query";
import type { BusySlot, RequestClassOption } from "@/modules/requests/components/new-lecturer-request-drawer";
import type { Lecturer } from "@/modules/users/users.type";

export async function lecturerRequestOptions(lecturer: Lecturer, preloaded?: ClassSectionView[]) {
  const term = await getCurrentTerm();
  const sections = preloaded ?? (await getLecturerClassSections(lecturer.id, term.id));
  const [rosters, rooms, sheets] = await Promise.all([
    Promise.all(sections.map((section) => getClassRoster(section.id))),
    getRooms(),
    getGradeSheets(sections.map((section) => section.id)),
  ]);
  const classes: RequestClassOption[] = sections.map((section, index) => ({
    id: section.id,
    code: section.code,
    courseName: section.courseName,
    meetings: section.meetings,
    endDate: section.endDate,
    students: rosters[index].map(({ studentId, studentCode, fullName }) => ({ studentId, studentCode, fullName })),
    components: sheets[index].components.map(({ key, label }) => ({ key, label })),
    scores: sheets[index].scores,
  }));
  const busySlots: BusySlot[] = sections.flatMap((section) => section.meetings.map((meeting) => ({ ...meeting, code: section.code })));
  const requester = { id: lecturer.id, name: lecturer.displayName, code: lecturer.code, unit: lecturer.faculty };
  return { classes, busySlots, rooms: rooms.filter((room) => room.status === "active").map((room) => room.code), requester };
}
