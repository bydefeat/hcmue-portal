import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/shared/libs/db.lib";
import { formatStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { ROLES } from "@/modules/access/access.mock";
import { announcements } from "@/modules/announcements/announcements.schema";
import { account, user } from "@/modules/authentication/authentication.schema";
import {
  classSections,
  enrollments,
  labGroups,
  registrationPeriods,
  reservedSeatMajors,
  reservedSeats,
  sectionMeetings,
  terms,
} from "@/modules/course-registration/course-registration.schema";
import { COURSES, PROGRAM_COURSES, PROGRAMS } from "@/modules/curriculum/curriculum.mock";
import { courseRelations, courses, faculties, majors, programCohorts, programCourses, programs } from "@/modules/curriculum/curriculum.schema";
import { campuses, rooms } from "@/modules/facilities/facilities.schema";
import { courseResults, gradeComponents, gradeSheets } from "@/modules/grades/grades.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { REGULATION } from "@/modules/settings/settings.mock";
import { calendarEvents, regulations } from "@/modules/settings/settings.schema";
import { PRICE_PER_CREDIT } from "@/modules/tuition/tuition.constant";
import { tuitionFees, tuitionRates } from "@/modules/tuition/tuition.schema";
import { administrativeClasses, lecturerLoadNorms, lecturers, staffMembers, students } from "@/modules/users/users.schema";

if (process.env.NODE_ENV === "production") throw new Error("Không chạy seed trên môi trường production");

const STUDENT_CODE = "5001104001";
const PASSWORD = process.env.DEFEAT_SEED_ACCOUNT_PASSWORD || "Hcmue@2026";
const PROGRAM_ID = "ctdt-cntt-2023";

const FACULTY_CODES: Record<string, string> = {
  "Khoa Lý luận chính trị": "LLCT",
  "Khoa Khoa học Giáo dục": "KHGD",
  "Khoa Công nghệ Thông tin": "CNTT",
  "Khoa Toán - Tin học": "TOAN",
  "Khoa Tiếng Anh": "ANH",
  "Khoa Tâm lý học": "TLH",
};

const PASSED: Record<string, [score: number, letter: string, point: number]> = {
  POLI1001: [8.2, "B+", 3.5],
  ENGL1001: [7.4, "B", 3],
  MATH1011: [6.8, "C+", 2.5],
  MATH1012: [8.9, "A", 4],
  COMP1010: [9.1, "A", 4],
  COMP1013: [8.4, "B+", 3.5],
  POLI1002: [7.9, "B", 3],
  ENGL1002: [7.1, "B", 3],
  MATH1020: [8.6, "A", 4],
  MATH1013: [7.7, "B", 3],
  COMP1020: [8.8, "A", 4],
  COMP1031: [9.0, "A", 4],
};

function by<T, K>(rows: T[], key: (row: T) => K) {
  return new Map(rows.map((row) => [key(row), row]));
}

async function main() {
  const programSeed = PROGRAMS.find((program) => program.id === PROGRAM_ID)!;
  const programCodes = new Set(PROGRAM_COURSES[PROGRAM_ID].map((entry) => entry.courseCode));
  const courseSeeds = COURSES.filter((course) => programCodes.has(course.code) || course.code === "COMP1121" || course.code === "MATH1014");
  const passwordHash = await hashPassword(PASSWORD);

  await db.transaction(async (tx) => {
    const tables = await tx.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    await tx.execute(sql.raw(`TRUNCATE ${tables.map((row) => `"${row.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`));

    const facultyRows = await tx
      .insert(faculties)
      .values(Object.entries(FACULTY_CODES).map(([name, code]) => ({ code, name })))
      .returning();
    const facultyByName = by(facultyRows, (row) => row.name);
    const it = facultyByName.get("Khoa Công nghệ Thông tin")!;

    const [major] = await tx.insert(majors).values({ code: programSeed.majorCode, name: programSeed.name, facultyId: it.id }).returning();

    const courseRows = await tx
      .insert(courses)
      .values(
        courseSeeds.map((course) => ({
          code: course.code,
          name: course.name,
          credits: course.credits,
          theoryCredits: course.theoryCredits,
          practiceCredits: course.practiceCredits,
          facultyId: facultyByName.get(course.faculty)!.id,
          type: course.type,
          block: course.block,
          isActive: course.isActive,
          description: course.description,
        })),
      )
      .returning();
    const courseByCode = by(courseRows, (row) => row.code);

    const relations = courseSeeds.flatMap((course) =>
      (
        [
          ["prerequisite", course.prerequisiteCodes],
          ["corequisite", course.corequisiteCodes],
          ["equivalent", course.equivalentCodes],
        ] as const
      ).flatMap(([kind, codes]) =>
        codes
          .filter((code) => courseByCode.has(code))
          .map((code) => ({ courseId: courseByCode.get(course.code)!.id, relatedCourseId: courseByCode.get(code)!.id, kind })),
      ),
    );
    await tx.insert(courseRelations).values(relations);

    const [program] = await tx
      .insert(programs)
      .values({
        code: programSeed.code,
        name: programSeed.name,
        majorId: major.id,
        degree: programSeed.degree,
        totalCredits: programSeed.totalCredits,
        durationYears: programSeed.durationYears,
        status: programSeed.status,
      })
      .returning();
    await tx.insert(programCohorts).values(programSeed.cohorts.map((cohort) => ({ programId: program.id, cohort })));
    await tx
      .insert(programCourses)
      .values(PROGRAM_COURSES[PROGRAM_ID].map((entry) => ({ programId: program.id, courseId: courseByCode.get(entry.courseCode)!.id, semester: entry.semester })));

    const [campus] = await tx.insert(campuses).values({ name: "Cơ sở An Dương Vương", address: "280 An Dương Vương, Phường Chợ Quán, TP. Hồ Chí Minh" }).returning();
    const roomRows = await tx
      .insert(rooms)
      .values([
        { campusId: campus.id, code: "B.405", building: "B", floor: 4, capacity: 60, examCapacity: 30, type: "lecture", equipment: ["Máy chiếu", "Micro"] },
        { campusId: campus.id, code: "C.301", building: "C", floor: 3, capacity: 45, examCapacity: 40, type: "lab", equipment: ["45 máy tính", "Máy chiếu"] },
        { campusId: campus.id, code: "A.201", building: "A", floor: 2, capacity: 80, examCapacity: 40, type: "lecture", equipment: ["Máy chiếu"] },
      ])
      .returning();
    const roomByCode = by(roomRows, (row) => row.code);

    const termRows = await tx
      .insert(terms)
      .values([
        { code: "hk2-2025", name: "Học kỳ 2, năm học 2025-2026", shortName: "HK2 2025-2026", academicYear: 2025, semester: 2, startDate: "2026-02-16", endDate: "2026-06-30" },
        { code: "hk1-2026", name: "Học kỳ 1, năm học 2026-2027", shortName: "HK1 2026-2027", academicYear: 2026, semester: 1, startDate: "2026-09-07", endDate: "2027-01-17", isCurrent: true },
        {
          code: "hk2-2026",
          name: "Học kỳ 2, năm học 2026-2027",
          shortName: "HK2 2026-2027",
          academicYear: 2026,
          semester: 2,
          startDate: "2027-02-22",
          endDate: "2027-06-27",
          isRegistrationTarget: true,
        },
      ])
      .returning();
    const termByCode = by(termRows, (row) => row.code);
    const [pastTerm, currentTerm, nextTerm] = ["hk2-2025", "hk1-2026", "hk2-2026"].map((code) => termByCode.get(code)!);

    const userRows = await tx
      .insert(user)
      .values([
        { name: "Phạm Gia Đạt", email: studentEmailOf(STUDENT_CODE), username: STUDENT_CODE, displayUsername: formatStudentCode(STUDENT_CODE), emailVerified: true, role: "student" },
        { name: "ThS. Phạm Thùy Hạnh", email: "hanhpt@hcmue.edu.vn", emailVerified: true, role: "lecturer" },
        { name: "Trần Minh Khoa", email: "khoatm@hcmue.edu.vn", emailVerified: true, role: "admin" },
      ])
      .returning();
    const [studentUser, lecturerUser, adminUser] = userRows;
    await tx.insert(account).values(userRows.map((row) => ({ userId: row.id, accountId: row.id, providerId: "credential", password: passwordHash })));

    const lecturerRows = await tx
      .insert(lecturers)
      .values([
        { userId: lecturerUser.id, code: "GV0104012", fullName: "Phạm Thùy Hạnh", title: "ThS.", gender: "female", facultyId: it.id, email: "hanhpt@hcmue.edu.vn", phone: "0908 112 334" },
        { code: "GV0104027", fullName: "Lê Thu Hương", title: "ThS.", gender: "female", facultyId: it.id, email: "huonglt@hcmue.edu.vn" },
        { code: "GV0104003", fullName: "Hoàng Khánh Hạnh", title: "PGS.TS.", gender: "female", facultyId: it.id, email: "hanhhk@hcmue.edu.vn" },
      ])
      .returning();
    const [hanh, huong, khanhHanh] = lecturerRows;

    await tx.insert(lecturerLoadNorms).values([
      { title: "ThS.", normHours: 135 },
      { title: "TS.", normHours: 135 },
      { title: "PGS.TS.", normHours: 120 },
      { title: "GS.TS.", normHours: 120 },
    ]);

    await tx.insert(staffMembers).values({ userId: adminUser.id, code: "CB0021", fullName: "Trần Minh Khoa", unit: "Phòng Đào tạo", email: "khoatm@hcmue.edu.vn" });

    const [homeClass] = await tx.insert(administrativeClasses).values({ code: "50.01.CNTT.A", majorId: major.id, cohort: 50, advisorId: hanh.id }).returning();
    const [student] = await tx
      .insert(students)
      .values({
        userId: studentUser.id,
        code: STUDENT_CODE,
        fullName: "Phạm Gia Đạt",
        gender: "male",
        dateOfBirth: "2006-03-14",
        email: studentEmailOf(STUDENT_CODE),
        phone: "0912 448 120",
        hometown: "Đồng Nai",
        administrativeClassId: homeClass.id,
      })
      .returning();

    await tx.insert(tuitionRates).values({ academicYear: 2026, majorId: major.id, pricePerCredit: PRICE_PER_CREDIT[major.code] ?? 0 });
    await tx.insert(tuitionFees).values({ academicYear: 2026, code: "bhyt", label: "Bảo hiểm y tế 12 tháng", amount: 1_263_600 });

    const roleRows = await tx
      .insert(roles)
      .values(ROLES.map(({ name, description, scope, isSystem }) => ({ name, description, scope, isSystem })))
      .returning();
    const roleByName = by(roleRows, (row) => row.name);
    await tx.insert(rolePermissions).values(ROLES.flatMap((role) => role.permissions.map((permission) => ({ roleId: roleByName.get(role.name)!.id, permission }))));
    await tx.insert(roleAssignments).values({ userId: adminUser.id, roleId: roleByName.get(ROLES[0].name)!.id, grantedByUserId: adminUser.id });

    const { grading, credits, warning, attendance, workflow } = REGULATION;
    await tx.insert(regulations).values({
      version: REGULATION.version,
      effectiveFrom: REGULATION.effectiveFrom,
      decision: "Quyết định 2412/QĐ-ĐHSP",
      summary: "Quy chế đào tạo trình độ đại học theo hệ thống tín chỉ",
      rules: { grading, credits, warning, attendance, workflow },
      createdByUserId: adminUser.id,
    });

    const section = (term: typeof currentTerm, code: string, number: number, lecturerId: string | null, capacity: number, status: "open" | "draft" = "open") => ({
      termId: term.id,
      courseId: courseByCode.get(code)!.id,
      sectionNumber: number,
      code: `${code}.${String(number).padStart(2, "0")}`,
      lecturerId,
      capacity,
      minEnrollment: 20,
      status,
      startDate: term.startDate,
      endDate: term.endDate,
    });
    const sectionRows = await tx
      .insert(classSections)
      .values([
        section(currentTerm, "COMP1040", 1, hanh.id, 45),
        section(currentTerm, "COMP1050", 1, huong.id, 50),
        section(currentTerm, "COMP1060", 1, khanhHanh.id, 45),
        section(nextTerm, "COMP1070", 1, hanh.id, 45),
        section(nextTerm, "COMP1080", 1, khanhHanh.id, 50),
        section(nextTerm, "COMP1120", 1, huong.id, 40),
        section(nextTerm, "COMP1121", 1, huong.id, 40),
      ])
      .returning();
    const sectionByCode = by(sectionRows, (row) => `${row.code}@${row.termId === currentTerm.id ? "now" : "next"}`);

    const meeting = (code: string, dayOfWeek: number, startPeriod: number, endPeriod: number, room: string) => ({
      classSectionId: sectionByCode.get(code)!.id,
      dayOfWeek,
      startPeriod,
      endPeriod,
      roomId: roomByCode.get(room)!.id,
    });
    await tx
      .insert(sectionMeetings)
      .values([
        meeting("COMP1040.01@now", 2, 1, 3, "B.405"),
        meeting("COMP1050.01@now", 4, 7, 9, "B.405"),
        meeting("COMP1060.01@now", 5, 1, 3, "A.201"),
        meeting("COMP1070.01@next", 3, 1, 3, "C.301"),
        meeting("COMP1080.01@next", 5, 7, 9, "B.405"),
        meeting("COMP1120.01@next", 6, 1, 3, "B.405"),
      ]);

    const labSection = sectionByCode.get("COMP1121.01@next")!;
    await tx.insert(labGroups).values([
      { classSectionId: labSection.id, code: "COMP1121.01.TH1", dayOfWeek: 6, startPeriod: 4, endPeriod: 6, roomId: roomByCode.get("C.301")!.id, capacity: 20 },
      { classSectionId: labSection.id, code: "COMP1121.01.TH2", dayOfWeek: 7, startPeriod: 1, endPeriod: 3, roomId: roomByCode.get("C.301")!.id, capacity: 20 },
    ]);
    const [reserved] = await tx
      .insert(reservedSeats)
      .values({ classSectionId: sectionByCode.get("COMP1080.01@next")!.id, label: "Khóa 50 ngành CNTT", seats: 15, cohorts: [50] })
      .returning();
    await tx.insert(reservedSeatMajors).values({ reservedSeatId: reserved.id, majorId: major.id });

    await tx.insert(registrationPeriods).values({
      termId: nextTerm.id,
      name: "Đợt 1, khóa 50 và 51",
      cohorts: [50, 51],
      opensAt: new Date("2026-10-17T01:00:00Z"),
      closesAt: new Date("2026-10-24T10:00:00Z"),
      minCredits: credits.minPerTerm,
      maxCredits: credits.maxPerTerm,
    });

    const enrollmentRows = await tx
      .insert(enrollments)
      .values(
        ["COMP1040.01@now", "COMP1050.01@now", "COMP1060.01@now"].map((key) => {
          const row = sectionByCode.get(key)!;
          return { studentId: student.id, classSectionId: row.id, termId: row.termId, courseId: row.courseId };
        }),
      )
      .returning();

    const [sheet] = await tx
      .insert(gradeSheets)
      .values({ classSectionId: sectionByCode.get("COMP1040.01@now")!.id, deadline: new Date("2027-01-24T16:59:00Z") })
      .returning();
    await tx.insert(gradeComponents).values([
      { gradeSheetId: sheet.id, key: "attendance", label: "Chuyên cần", weight: 10, position: 1 },
      { gradeSheetId: sheet.id, key: "midterm", label: "Giữa kỳ", weight: 30, position: 2 },
      { gradeSheetId: sheet.id, key: "final", label: "Cuối kỳ", weight: 60, position: 3 },
    ]);

    await tx.insert(courseResults).values(
      Object.entries(PASSED).map(([code, [score10, letter, point4]]) => ({
        studentId: student.id,
        courseId: courseByCode.get(code)!.id,
        termId: pastTerm.id,
        source: "transfer" as const,
        score10,
        letter,
        point4,
        note: "Kết quả nhập từ hệ thống cũ",
      })),
    );

    await tx.insert(calendarEvents).values([
      { termId: currentTerm.id, kind: "teaching", title: "Bắt đầu học kỳ", startDate: "2026-09-07", endDate: "2026-09-07", audience: "Toàn trường" },
      { termId: nextTerm.id, kind: "registration", title: "Đăng ký học phần đợt 1", startDate: "2026-10-17", endDate: "2026-10-24", audience: "Khóa 50, 51" },
    ]);

    await tx.insert(announcements).values({
      slug: "dang-ky-hoc-phan-hk2-2026-2027-dot-1",
      title: "Đăng ký học phần học kỳ 2, năm học 2026-2027, đợt 1",
      category: "registration",
      audiences: ["Khóa 50", "Khóa 51"],
      status: "published",
      isPinned: true,
      publishedAt: new Date("2026-10-10T02:00:00Z"),
      deadline: new Date("2026-10-24T10:00:00Z"),
      authorUserId: adminUser.id,
      summary: "Sinh viên khóa 50 và 51 đăng ký học phần học kỳ 2 từ 17/10 đến 17:00 ngày 24/10/2026.",
      content: "Sinh viên xem kế hoạch học tập đã được cố vấn duyệt, chọn lớp trên cổng và bấm Đăng ký trước khi đợt đóng.",
    });

    await tx.insert(notifications).values({
      recipientUserId: studentUser.id,
      kind: "deadline",
      title: "Đợt đăng ký học phần đang mở",
      body: "Đợt 1 học kỳ 2 đóng lúc 17:00 ngày 24/10/2026.",
      href: "/application/registration",
    });

    console.log(
      `Đã seed ${courseRows.length} học phần, ${relations.length} quan hệ học phần, ${sectionRows.length} lớp học phần, ${enrollmentRows.length} đăng ký, 3 tài khoản (mật khẩu ${PASSWORD === "Hcmue@2026" ? "mặc định Hcmue@2026" : "từ DEFEAT_SEED_ACCOUNT_PASSWORD"}).`,
    );
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
