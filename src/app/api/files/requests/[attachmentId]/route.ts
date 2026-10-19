import { fileErrorResponse, fileResponse, readFile } from "@/shared/libs/storage.lib";
import { getSession } from "@/modules/authentication/authentication.query";
import { getRequestAttachmentFile } from "@/modules/requests/requests.query";

// Tải minh chứng đơn từ: chỉ người xem được đơn (người gửi, người có bước duyệt) tải được. Không có quyền cũng trả 404 để
// không lộ tệp có tồn tại hay không.
export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  if (!(await getSession())) return fileErrorResponse(401, "Chưa đăng nhập");
  const { attachmentId } = await params;
  const file = await getRequestAttachmentFile(attachmentId);
  if (!file) return fileErrorResponse(404, "Không tìm thấy tệp");
  const data = await readFile(file.storageKey);
  if (!data) return fileErrorResponse(404, "Tệp không còn trong kho lưu trữ");
  return fileResponse(data, file);
}
