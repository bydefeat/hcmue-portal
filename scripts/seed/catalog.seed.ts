import type { Transaction } from "@/shared/libs/db.lib";
import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { COURSES, PROGRAM_COURSES, PROGRAMS } from "@/modules/curriculum/curriculum.mock";
import { courseRelations, courses, faculties, majors, programCohorts, programCourses, programs } from "@/modules/curriculum/curriculum.schema";
import { CAMPUSES, ROOMS } from "@/modules/facilities/facilities.mock";
import { campuses, rooms } from "@/modules/facilities/facilities.schema";
import { by, type SeedContext } from "./context";

const FACULTY_CODES: Record<string, string> = {
  "Khoa Lý luận chính trị": "LLCT",
  "Khoa Khoa học Giáo dục": "KHGD",
  "Khoa Công nghệ Thông tin": "CNTT",
  "Khoa Toán - Tin học": "TOAN",
  "Khoa Tiếng Anh": "ANH",
  "Khoa Tâm lý học": "TLH",
  "Khoa Ngữ văn": "VAN",
  "Khoa Vật lý": "VL",
};

// Khoa, ngành, học phần và quan hệ học phần, chương trình đào tạo, cơ sở và phòng học.
export async function seedCatalog(tx: Transaction, context: SeedContext) {
  const facultyRows = await tx
    .insert(faculties)
    .values(Object.entries(FACULTY_CODES).map(([name, code]) => ({ code, name })))
    .returning();
  context.facultyByName = by(facultyRows, (row) => row.name);

  const majorRows = await tx
    .insert(majors)
    .values(MOCK_MAJORS.map((entry) => ({ code: entry.code, name: entry.name, facultyId: context.facultyByName.get(entry.faculty)!.id })))
    .returning();
  context.majorByCode = by(majorRows, (row) => row.code);

  const courseRows = await tx
    .insert(courses)
    .values(
      COURSES.map((course) => ({
        code: course.code,
        name: course.name,
        credits: course.credits,
        theoryCredits: course.theoryCredits,
        practiceCredits: course.practiceCredits,
        facultyId: context.facultyByName.get(course.faculty)!.id,
        type: course.type,
        block: course.block,
        isActive: course.isActive,
        description: course.description,
      })),
    )
    .returning();
  context.courseByCode = by(courseRows, (row) => row.code);

  const relations = COURSES.flatMap((course) =>
    (
      [
        ["prerequisite", course.prerequisiteCodes],
        ["corequisite", course.corequisiteCodes],
        ["equivalent", course.equivalentCodes],
      ] as const
    ).flatMap(([kind, codes]) =>
      codes
        .filter((code) => context.courseByCode.has(code))
        .map((code) => ({ courseId: context.courseByCode.get(course.code)!.id, relatedCourseId: context.courseByCode.get(code)!.id, kind })),
    ),
  );
  await tx.insert(courseRelations).values(relations);

  const programRows = await tx
    .insert(programs)
    .values(
      PROGRAMS.map((entry) => ({
        code: entry.code,
        name: entry.name,
        majorId: context.majorByCode.get(entry.majorCode)!.id,
        degree: entry.degree,
        totalCredits: entry.totalCredits,
        durationYears: entry.durationYears,
        status: entry.status,
        updatedAt: new Date(entry.updatedAt),
      })),
    )
    .returning();
  const programIdOf = new Map(PROGRAMS.map((entry, index) => [entry.id, programRows[index].id]));
  await tx.insert(programCohorts).values(PROGRAMS.flatMap((entry) => entry.cohorts.map((cohort) => ({ programId: programIdOf.get(entry.id)!, cohort }))));
  await tx.insert(programCourses).values(
    Object.entries(PROGRAM_COURSES).flatMap(([programKey, plan]) =>
      plan.map((entry) => ({ programId: programIdOf.get(programKey)!, courseId: context.courseByCode.get(entry.courseCode)!.id, semester: entry.semester })),
    ),
  );

  const campusRows = await tx
    .insert(campuses)
    .values(CAMPUSES.map(({ name, address }) => ({ name, address })))
    .returning();
  const campusIdOf = new Map(CAMPUSES.map((campus, index) => [campus.id, campusRows[index].id]));
  const roomRows = await tx
    .insert(rooms)
    .values(ROOMS.map(({ id: _id, campusId, ...room }) => ({ ...room, campusId: campusIdOf.get(campusId)! })))
    .returning();
  context.roomByCode = by(roomRows, (row) => row.code);

  return { courses: courseRows.length, relations: relations.length, programs: programRows.length };
}
