import type { Metadata } from "next";
import { standingLabel } from "@/modules/grades/grades.constant";
import { getStudentStandings } from "@/modules/grades/grades.query";
import { StudentTable } from "@/modules/users/components/student-table";
import { getAccountStates, getCohorts, getStudents } from "@/modules/users/users.query";
import { NO_ACCOUNT } from "@/modules/users/users.constant";
import { getMajors } from "@/modules/curriculum/curriculum.query";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Quản lý sinh viên" };

export default async function Page() {
  const viewer = await requirePermission("students.view");
  const [allStudents, allMajors, cohorts, accounts] = await Promise.all([getStudents(), getMajors(), getCohorts(), getAccountStates("student")]);
  const students = allStudents.filter((student) => inScope(viewer, student.faculty));
  const majors = allMajors.filter((major) => inScope(viewer, major.faculty));
  const standings = await getStudentStandings(students.map((student) => student.id));
  const standingById = new Map(standings.map((standing) => [standing.studentId, standing]));
  const rows = students.map((student) => {
    const standing = standingById.get(student.id);
    return {
      ...student,
      cpa4: standing?.cpa4 ?? null,
      standingLabel: standing?.standing ? standingLabel(standing.standing) : null,
      account: accounts[student.id] ?? NO_ACCOUNT,
    };
  });

  return (
    <StudentTable
      header={{
        title: "Sinh viên",
        description: `${students.length.toLocaleString("vi-VN")} hồ sơ thuộc ${new Set(students.map((student) => student.className)).size} lớp sinh hoạt. Mở hồ sơ từng sinh viên để xem kết quả học tập và đăng ký học phần.`,
      }}
      students={rows}
      majors={majors}
      cohorts={cohorts}
    />
  );
}
