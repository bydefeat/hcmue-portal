import { mockDelay } from "@/shared/libs/mock-request.lib";
import { CALENDAR_EVENTS, REGULATION, REGULATION_VERSIONS } from "./settings.mock";

export async function getRegulation() {
  await mockDelay();
  return REGULATION;
}

export async function getRegulationVersions() {
  return REGULATION_VERSIONS;
}

export async function getCalendarEvents(termId?: string) {
  await mockDelay();
  return CALENDAR_EVENTS.filter((event) => !termId || event.termId === termId).sort((a, b) => a.startDate.localeCompare(b.startDate));
}
