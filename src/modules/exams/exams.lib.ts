import "server-only";
import { inArray, or } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { sweepOrphanFiles } from "@/shared/libs/storage.lib";
import { examSessions } from "@/modules/exams/exams.schema";

// Tác vụ định kỳ: xóa tệp đề thi, đáp án không còn ca thi nào trỏ tới (bản cũ của lần nộp lại chưa xóa được, tiến trình chết
// giữa lúc ghi tệp và commit).
export async function sweepOrphanExamFiles() {
  const removed = await sweepOrphanFiles("exams", async (keys) => {
    const rows = await db
      .select({ paper: examSessions.paperStorageKey, answerKey: examSessions.answerKeyStorageKey })
      .from(examSessions)
      .where(or(inArray(examSessions.paperStorageKey, keys), inArray(examSessions.answerKeyStorageKey, keys)));
    return new Set(rows.flatMap((row) => [row.paper, row.answerKey]).filter((key) => key !== null));
  });
  return { examFilesRemoved: removed };
}
