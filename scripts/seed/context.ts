import type { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import type { rooms } from "@/modules/facilities/facilities.schema";
import type { terms } from "@/modules/course-registration/course-registration.schema";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

// Bảng tra dùng chung giữa các bước seed: bước sau tra id của bước trước theo mã tự nhiên.
export type SeedContext = {
  passwordHash: string;
  facultyByName: Map<string, Row<typeof faculties>>;
  majorByCode: Map<string, Row<typeof majors>>;
  courseByCode: Map<string, Row<typeof courses>>;
  roomByCode: Map<string, Row<typeof rooms>>;
  termByKey: Map<string, Row<typeof terms>>;
  studentUserId: string;
  lecturerUserId: string;
  adminUserId: string;
};

export function by<T, K>(rows: T[], key: (row: T) => K) {
  return new Map(rows.map((row) => [key(row), row]));
}
