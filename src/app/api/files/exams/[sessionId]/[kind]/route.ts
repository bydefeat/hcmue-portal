import { fileErrorResponse, fileResponse, readFile } from "@/shared/libs/storage.lib";
import { getSession } from "@/modules/authentication/authentication.query";
import { getExamPaperFile } from "@/modules/exams/exams.query";
import type { ExamPaperFileKind } from "@/modules/exams/exams.type";

const KINDS: ExamPaperFileKind[] = ["paper", "answer-key"];

// Tải đề thi (`paper`) hoặc đáp án (`answer-key`): chỉ giảng viên dạy lớp và cán bộ có quyền quản lý thi trong phạm vi khoa.
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string; kind: string }> }) {
  if (!(await getSession())) return fileErrorResponse(401, "Chưa đăng nhập");
  const { sessionId, kind } = await params;
  if (!KINDS.includes(kind as ExamPaperFileKind)) return fileErrorResponse(404, "Không tìm thấy tệp");
  const file = await getExamPaperFile(sessionId, kind as ExamPaperFileKind);
  if (!file) return fileErrorResponse(404, "Không tìm thấy tệp");
  const data = await readFile(file.storageKey);
  if (!data) return fileErrorResponse(404, "Tệp không còn trong kho lưu trữ");
  return fileResponse(data, file);
}
