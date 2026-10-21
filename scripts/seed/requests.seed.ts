import type { Transaction } from "@/shared/libs/db.lib";
import { deleteFiles, listFiles, newStorageKey, putFile } from "@/shared/libs/storage.lib";
import { CURRENT_LECTURER_ID } from "@/modules/users/users.mock";
import { REQUESTS } from "@/modules/requests/requests.mock";
import { academicRequests, requestAttachments, requestCodeCounters, requestSteps } from "@/modules/requests/requests.schema";
import type { SeedContext } from "./context";
import { samplePdf } from "./sample-file";

const CODE = /^([A-Z]{2})-(\d{4})-(\d{5})$/;

const date = (value: string | null) => (value ? new Date(value) : null);

export async function seedRequests(tx: Transaction, context: SeedContext) {
  await tx.insert(academicRequests).values(
    REQUESTS.map((request) => ({
      id: request.id,
      code: request.code,
      kind: request.kind,
      requesterStudentId: request.requesterType === "student" ? request.requesterId : null,
      requesterLecturerId: request.requesterType === "lecturer" ? request.requesterId : null,
      facultyId: context.facultyByName.get(request.faculty)!.id,
      classSectionId: request.classSectionId,
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
      assigneeLecturerId: step.role === "lecturer" || (step.role === "advisor" && step.actedAt) ? step.assigneeId : null,
      status: step.status,
      dueAt: date(step.dueAt),
      actorUserId: step.actedAt && step.assigneeId === CURRENT_LECTURER_ID ? context.lecturerUserId : null,
      actorName: step.actedAt ? step.actorName : null,
      actedAt: date(step.actedAt),
      comment: step.comment,
    })),
  );
  await tx.insert(requestSteps).values(steps);
  const files = REQUESTS.flatMap((request) =>
    request.attachments.map((attachment) => {
      const data = samplePdf(attachment.fileName);
      return {
        id: attachment.id,
        requestId: request.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        sizeBytes: data.byteLength,
        storageKey: newStorageKey("requests", attachment.id),
        uploadedAt: new Date(attachment.uploadedAt),
        data,
      };
    }),
  );
  await deleteFiles((await listFiles("requests")).map((entry) => entry.key));
  await Promise.all(files.map((file) => putFile(file.storageKey, file.data)));
  if (files.length > 0) await tx.insert(requestAttachments).values(files.map(({ data: _data, ...file }) => file));
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
