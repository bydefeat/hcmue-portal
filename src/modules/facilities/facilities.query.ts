import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { campuses, rooms } from "@/modules/facilities/facilities.schema";
import type { Campus, Room } from "@/modules/facilities/facilities.type";

export const ROOM_COLUMNS = {
  id: rooms.id,
  code: rooms.code,
  campusId: rooms.campusId,
  building: rooms.building,
  floor: rooms.floor,
  capacity: rooms.capacity,
  examCapacity: rooms.examCapacity,
  type: rooms.type,
  equipment: rooms.equipment,
  status: rooms.status,
  note: rooms.note,
};

export async function getCampuses(): Promise<Campus[]> {
  await requireSession();
  return db.select({ id: campuses.id, name: campuses.name, address: campuses.address }).from(campuses).orderBy(asc(campuses.name));
}

export async function getRooms(): Promise<Room[]> {
  await requireSession();
  return db.select(ROOM_COLUMNS).from(rooms).orderBy(asc(rooms.code));
}
