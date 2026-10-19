"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { requireSchoolWidePermission } from "@/modules/access/access.query";
import { FACILITIES_CONSTRAINT_MESSAGE } from "@/modules/facilities/facilities.constant";
import { ROOM_COLUMNS } from "@/modules/facilities/facilities.query";
import { ROOM_UPDATE_SCHEMA, type RoomUpdateInput } from "@/modules/facilities/facilities.rule";
import { rooms } from "@/modules/facilities/facilities.schema";
import type { Room } from "@/modules/facilities/facilities.type";

export async function updateRoom(input: RoomUpdateInput): Promise<ActionResult<Room>> {
  await requireSchoolWidePermission("facilities.manage");
  const parsed = parseInput(ROOM_UPDATE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { id, ...values } = parsed.data;
  try {
    const [room] = await db.update(rooms).set(values).where(eq(rooms.id, id)).returning(ROOM_COLUMNS);
    if (!room) return actionError("Phòng không còn trong danh mục, tải lại trang để xem danh sách mới.");
    revalidatePath("/administrator/rooms");
    return actionOk(room);
  } catch (error) {
    return actionFailure(error, FACILITIES_CONSTRAINT_MESSAGE);
  }
}
