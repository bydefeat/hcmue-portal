import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { inScope } from "@/modules/access/access.constant";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { frameworkChangeError, isProgramEditable, programSemesterLimit } from "@/modules/curriculum/curriculum.rule";
import { courses, faculties, majors, programCourses, programs } from "@/modules/curriculum/curriculum.schema";
import type { ProgramCourseChange } from "@/modules/curriculum/curriculum.type";

// Lỗi nghiệp vụ khi sửa khung: hủy giao dịch, câu báo đưa thẳng cho người dùng.
export class FrameworkError extends Error {}

function changeSummary(change: ProgramCourseChange, from: number | undefined) {
  if (change.kind === "add") return `Thêm ${change.courseCodes.join(", ")} vào học kỳ ${change.semester}`;
  if (change.kind === "remove") return `Bỏ ${change.courseCode} khỏi khung (học kỳ ${from})`;
  return `Chuyển ${change.courseCode} từ học kỳ ${from} sang học kỳ ${change.semester}`;
}

// Sửa khung chương trình trong giao dịch của nơi gọi: khóa dòng chương trình để hai người sửa cùng lúc không chen nhau,
// kiểm lại trạng thái, phạm vi khoa và ràng buộc với dữ liệu mới nhất, ghi nhật ký cùng giao dịch.
export async function applyProgramCourseChange(
  tx: Transaction,
  input: { programId: string; change: ProgramCourseChange; actor: AuditActor; faculty: string | null },
) {
  const { programId, change } = input;
  const [program] = await tx
    .select({ id: programs.id, name: programs.name, status: programs.status, durationYears: programs.durationYears, faculty: faculties.name })
    .from(programs)
    .innerJoin(majors, eq(majors.id, programs.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(programs.id, programId))
    .for("update", { of: programs });
  if (!program) throw new FrameworkError("Chương trình không còn trong danh mục, tải lại trang.");
  if (!inScope({ faculty: input.faculty }, program.faculty)) throw new FrameworkError("Chương trình thuộc khoa khác, bạn chỉ sửa được khung của khoa mình.");
  if (!isProgramEditable(program.status)) throw new FrameworkError("Chương trình đã ngừng áp dụng nên khung chỉ xem được.");

  const codes = change.kind === "add" ? change.courseCodes : [change.courseCode];
  const [plan, catalogRows] = await Promise.all([
    tx
      .select({ courseCode: courses.code, semester: programCourses.semester })
      .from(programCourses)
      .innerJoin(courses, eq(courses.id, programCourses.courseId))
      .where(eq(programCourses.programId, programId)),
    tx.select({ id: courses.id, code: courses.code, isActive: courses.isActive }).from(courses).where(inArray(courses.code, codes)),
  ]);
  const catalog = new Map(catalogRows.map((row) => [row.code, row]));
  const error = frameworkChangeError(plan, change, catalog, programSemesterLimit(program.durationYears));
  if (error) throw new FrameworkError(error);
  const from = change.kind === "add" ? undefined : plan.find((entry) => entry.courseCode === change.courseCode)?.semester;

  if (change.kind === "add") {
    await tx.insert(programCourses).values(change.courseCodes.map((code) => ({ programId, courseId: catalog.get(code)!.id, semester: change.semester })));
  } else {
    const where = and(eq(programCourses.programId, programId), eq(programCourses.courseId, catalog.get(change.courseCode)!.id));
    if (change.kind === "remove") await tx.delete(programCourses).where(where);
    else await tx.update(programCourses).set({ semester: change.semester }).where(where);
  }
  await tx.update(programs).set({ updatedAt: new Date() }).where(eq(programs.id, programId));

  const summary = changeSummary(change, from);
  await recordAudit(tx, {
    actor: input.actor,
    action: "update",
    entityType: "program",
    entityId: programId,
    entityLabel: program.name,
    summary,
    changes: codes.map((code) => ({
      field: code,
      before: from === undefined ? "" : `Học kỳ ${from}`,
      after: change.kind === "remove" ? "" : `Học kỳ ${change.semester}`,
    })),
  });
  return { summary };
}
