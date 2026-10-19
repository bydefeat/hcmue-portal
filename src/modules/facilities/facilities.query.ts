import { mockDelay } from "@/shared/libs/mock-request.lib";
import { CAMPUSES, ROOMS } from "@/modules/facilities/facilities.mock";

export async function getCampuses() {
  return CAMPUSES;
}

export async function getRooms() {
  await mockDelay();
  return ROOMS;
}
