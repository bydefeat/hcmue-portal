import { fileErrorResponse, fileResponse, openFile } from "@/shared/libs/storage.lib";
import { getSession } from "@/modules/authentication/authentication.query";
import { getRequestAttachmentFile } from "@/modules/requests/requests.query";

export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  if (!(await getSession())) return fileErrorResponse(401, "Chưa đăng nhập");
  const { attachmentId } = await params;
  const file = await getRequestAttachmentFile(attachmentId);
  if (!file) return fileErrorResponse(404, "Không tìm thấy tệp");
  const content = await openFile(file.storageKey);
  if (!content) return fileErrorResponse(404, "Tệp không còn trong kho lưu trữ");
  return fileResponse(content, file);
}
