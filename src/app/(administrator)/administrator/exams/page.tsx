import type { Metadata } from "next";
import Link from "next/link";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { AdminExamSchedule } from "@/modules/exams/components/admin-exam-schedule";
import { getExamSessions } from "@/modules/exams/exams.query";
import { getRooms } from "@/modules/facilities/facilities.query";
import { getLecturers } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Lịch thi" };

export default async function Page() {
  const viewer = await requirePermission("exams.manage");
  const term = await getCurrentTerm();
  const [sessions, rooms, lecturers] = await Promise.all([getExamSessions(term.id), getRooms(), getLecturers()]);

  return (
    <AdminExamSchedule
      header={{
        title: "Lịch thi",
        description: (
          <>
            {term.name}. Mỗi phòng thi cần đủ chỗ ngồi thi và 2 cán bộ coi thi; ca thi trùng phòng hoặc trùng cán bộ được đánh dấu đỏ. Danh sách được dự
            thi xem ở <Link href="/administrator/exams/eligibility">Điều kiện dự thi</Link>.
          </>
        ),
      }}
      termId={term.id}
      sessions={sessions.filter((session) => inScope(viewer, session.faculty))}
      rooms={rooms.map((room) => ({ id: room.id, code: room.code, examCapacity: room.examCapacity, isAvailable: room.status === "active" }))}
      proctors={lecturers.filter((lecturer) => lecturer.status === "active").map((lecturer) => ({ id: lecturer.id, name: lecturer.displayName, faculty: lecturer.faculty }))}
    />
  );
}
