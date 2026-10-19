import type { Metadata } from "next";
import { STANDING_LABEL } from "@/modules/grades/grades.constant";
import { getStudentStandings } from "@/modules/grades/grades.query";
import { StudentTable } from "@/modules/users/components/student-table";
import { getStudents } from "@/modules/users/users.query";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Quản lý sinh viên" };

export default async function Page() {
  const viewer = await requirePermission("students.view");
  const students = (await getStudents()).filter((student) => inScope(viewer, student.faculty));
  const standings = await getStudentStandings(students.map((student) => student.id));
  const standingById = new Map(standings.map((standing) => [standing.studentId, standing]));
  const rows = students.map((student) => {
    const standing = standingById.get(student.id);
    return {
      ...student,
      cpa4: standing && standing.earnedCredits > 0 ? standing.cpa4 : null,
      standingLabel: standing ? STANDING_LABEL[standing.standing] : null,
    };
  });

  return (
    <StudentTable
      header={{
        title: "Sinh viên",
        description: `${students.length.toLocaleString("vi-VN")} hồ sơ thuộc ${new Set(students.map((student) => student.className)).size} lớp sinh hoạt. Mở hồ sơ từng sinh viên để xem kết quả học tập và đăng ký học phần.`,
      }}
      students={rows}
    />
  );
}
