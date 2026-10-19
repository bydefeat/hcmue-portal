import { createRandom } from "@/shared/libs/mock.lib";
import type { AttendanceBook, AttendanceSession, AttendanceStatus } from "@/modules/schedule/schedule.type";

function seedOf(value: string) {
  return [...value].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381);
}

function mockStatus(random: () => number, reliability: number): AttendanceStatus {
  const roll = random();
  if (roll < reliability) return "present";
  if (roll < reliability + (1 - reliability) * 0.35) return "late";
  if (roll < reliability + (1 - reliability) * 0.6) return "excused";
  return "absent";
}

export function mockAttendanceRecords(sessions: AttendanceSession[], studentIds: string[]) {
  const records: AttendanceBook["records"] = {};
  for (const session of sessions.filter((entry) => entry.isTaken)) {
    records[session.id] = {};
    for (const studentId of studentIds) {
      const random = createRandom(seedOf(`${session.id}:${studentId}`));
      const reliability = 0.97 - (seedOf(studentId) % 9 === 0 ? 0.32 : 0);
      records[session.id][studentId] = mockStatus(random, reliability);
    }
  }
  return records;
}
