import { mockDelay } from "@/shared/libs/mock-request.lib";
import { requestView } from "@/modules/requests/requests.constant";
import { REQUESTS } from "@/modules/requests/requests.mock";
import type { RequestView, StepRole } from "@/modules/requests/requests.type";

function newestFirst(a: RequestView, b: RequestView) {
  return b.createdAt.localeCompare(a.createdAt);
}

export async function getRequests() {
  await mockDelay();
  return REQUESTS.map(requestView).sort(newestFirst);
}

export async function getRequestsOf(requesterId: string) {
  await mockDelay();
  return REQUESTS.filter((request) => request.requesterId === requesterId).map(requestView).sort(newestFirst);
}

export async function getRequestsForAssignee(assigneeId: string, roles: StepRole[]) {
  await mockDelay();
  return REQUESTS.filter((request) => request.steps.some((step) => roles.includes(step.role) && step.assigneeId === assigneeId))
    .map(requestView)
    .sort(newestFirst);
}

export async function getRequest(id: string) {
  const request = REQUESTS.find((entry) => entry.id === id);
  return request ? requestView(request) : null;
}
