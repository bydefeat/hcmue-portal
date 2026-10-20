import type { Metadata } from "next";
import Link from "next/link";
import { can, inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { AdminExamSchedule } from "@/modules/exams/components/admin-exam-schedule";
import { getExamClassOptions, getExamDeferrals, getExamSessions } from "@/modules/exams/exams.query";
import { getRooms } from "@/modules/facilities/facilities.query";
import { getLecturers } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Lịch thi" };

export default async function Page() {
  const viewer = await requirePermission("exams.manage");
  const term = await getCurrentTerm();
  const [sessions, rooms, lecturers, classes, deferrals] = await Promise.all([getExamSessions(term.id), getRooms(), getLecturers(), getExamClassOptions(term.id), getExamDeferrals(term.id)]);

  return (
    <AdminExamSchedule
      header={{
        title: "Lịch thi",
        description: (
          <>
            {term.name}. Một ca có thể chia nhiều phòng theo sức chứa thi, mỗi phòng ít nhất 2 cán bộ coi thi; xung đột phòng, cán bộ, lịch thi của sinh viên và giờ dạy tính trên toàn học kỳ. Danh sách được dự thi,
            hoãn thi xem ở <Link href="/administrator/exams/eligibility">Điều kiện dự thi</Link>.
          </>
        ),
      }}
      termId={term.id}
      canReview={can(viewer, "exams.review")}
      sessions={sessions.filter((session) => inScope(viewer, session.faculty))}
      classes={classes.filter((entry) => inScope(viewer, entry.faculty))}
      deferrals={deferrals.filter((entry) => inScope(viewer, entry.faculty))}
      rooms={rooms.map((room) => ({ id: room.id, code: room.code, examCapacity: room.examCapacity, isAvailable: room.status === "active" }))}
      proctors={lecturers.filter((lecturer) => lecturer.status === "active").map((lecturer) => ({ id: lecturer.id, name: lecturer.displayName, faculty: lecturer.faculty }))}
    />
  );
}
