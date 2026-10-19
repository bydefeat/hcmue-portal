import type { Transaction } from "@/shared/libs/db.lib";
import { createRandom } from "@/shared/libs/mock.lib";
import { CURRENT_LECTURER_ID } from "@/modules/users/users.mock";
import { REQUESTS } from "@/modules/requests/requests.mock";
import { academicRequests, requestAttachments, requestCodeCounters, requestSteps } from "@/modules/requests/requests.schema";
import type { SeedContext } from "./context";

const CONTENT_TYPE: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

const CODE = /^([A-Z]{2})-(\d{4})-(\d{5})$/;

const date = (value: string | null) => (value ? new Date(value) : null);

// Đơn từ: đơn, các bước duyệt (giữ nguyên trạng thái, hạn, người xử lý của mock), tên tệp minh chứng và bộ đếm mã đơn.
export async function seedRequests(tx: Transaction, context: SeedContext) {
  await tx.insert(academicRequests).values(
    REQUESTS.map((request) => ({
      id: request.id,
      code: request.code,
      kind: request.kind,
      requesterStudentId: request.requesterType === "student" ? request.requesterId : null,
      requesterLecturerId: request.requesterType === "lecturer" ? request.requesterId : null,
      facultyId: context.facultyByName.get(request.faculty)!.id,
      subject: request.subject,
      details: request.details,
      reason: request.reason,
      createdAt: new Date(request.createdAt),
      cancelledAt: date(request.cancelledAt),
    })),
  );
  const steps = REQUESTS.flatMap((request) =>
    request.steps.map((step, index) => ({
      requestId: request.id,
      position: index + 1,
      role: step.role,
      label: step.label,
      assigneeLecturerId: step.role === "lecturer" ? step.assigneeId : null,
      status: step.status,
      dueAt: date(step.dueAt),
      // Người xử lý trong mock là cán bộ chưa có tài khoản, trừ giảng viên có tài khoản seed.
      actorUserId: step.actedAt && step.assigneeId === CURRENT_LECTURER_ID ? context.lecturerUserId : null,
      actorName: step.actedAt ? step.actorName : null,
      actedAt: date(step.actedAt),
      comment: step.comment,
    })),
  );
  await tx.insert(requestSteps).values(steps);
  const files = REQUESTS.flatMap((request, requestIndex) =>
    request.attachments.map((fileName, index) => {
      const random = createRandom(requestIndex * 31 + index + 7);
      return {
        requestId: request.id,
        fileName,
        contentType: CONTENT_TYPE[fileName.split(".").at(-1)?.toLowerCase() ?? ""] ?? "application/octet-stream",
        sizeBytes: 80_000 + Math.floor(random() * 2_000_000),
        uploadedAt: new Date(request.createdAt),
      };
    }),
  );
  if (files.length > 0) await tx.insert(requestAttachments).values(files);
  // Bộ đếm bắt đầu từ số lớn nhất đã dùng để đơn mới gửi nối tiếp mã của dữ liệu mẫu.
  const counters = new Map<string, { prefix: string; year: number; lastValue: number }>();
  for (const request of REQUESTS) {
    const [, prefix, year, value] = CODE.exec(request.code)!;
    const key = `${prefix}-${year}`;
    const lastValue = Math.max(counters.get(key)?.lastValue ?? 0, Number(value));
    counters.set(key, { prefix, year: Number(year), lastValue });
  }
  await tx.insert(requestCodeCounters).values([...counters.values()]);
  return { requests: REQUESTS.length, steps: steps.length, attachments: files.length };
}
