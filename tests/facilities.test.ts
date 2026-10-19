import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { FACILITIES_CONSTRAINT_MESSAGE } from "@/modules/facilities/facilities.constant";
import { ROOM_UPDATE_SCHEMA } from "@/modules/facilities/facilities.rule";
import { rooms } from "@/modules/facilities/facilities.schema";

after(() => db.$client.end());

const valid = {
  id: "0192f3a4-0000-7000-8000-000000000000",
  type: "lecture",
  capacity: 60,
  examCapacity: 40,
  equipment: ["Máy chiếu", "Máy chiếu"],
  status: "active",
  note: "  Ghi chú  ",
} as const;

describe("facilities: kiểm dữ liệu sửa phòng", () => {
  test("dữ liệu hợp lệ được chuẩn hoá: bỏ thiết bị trùng, cắt khoảng trắng ghi chú", () => {
    const parsed = parseInput(ROOM_UPDATE_SCHEMA, valid);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.equipment, ["Máy chiếu"]);
    assert.equal(parsed.data.note, "Ghi chú");
  });

  test("báo lỗi theo từng ô, kể cả ràng buộc giữa hai ô", () => {
    const parsed = parseInput(ROOM_UPDATE_SCHEMA, { ...valid, id: "a201", capacity: 30, examCapacity: 40, equipment: ["Lò vi sóng"] });
    assert.equal(parsed.ok, false);
    assert.ok(!parsed.ok && parsed.fieldErrors);
    const fields = !parsed.ok ? Object.keys(parsed.fieldErrors ?? {}) : [];
    assert.ok(fields.includes("id"));
    assert.ok(fields.includes("equipment.0"));
  });

  test("chỗ thi lớn hơn chỗ học bị chặn ở form", () => {
    const parsed = parseInput(ROOM_UPDATE_SCHEMA, { ...valid, capacity: 30, examCapacity: 40 });
    assert.ok(!parsed.ok);
    assert.equal(!parsed.ok && parsed.fieldErrors?.examCapacity, "Không vượt quá chỗ ngồi học");
  });
});

describe("facilities: ràng buộc ở DB", () => {
  test("bỏ qua form thì DB vẫn chặn và trả câu tiếng Việt của module", async () => {
    const [room] = await db.select().from(rooms).limit(1);
    const error = await db
      .update(rooms)
      .set({ examCapacity: room.capacity + 1 })
      .where(eq(rooms.id, room.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, FACILITIES_CONSTRAINT_MESSAGE), FACILITIES_CONSTRAINT_MESSAGE.rooms_exam_capacity_range);
  });

  test("trùng mã phòng trong cùng cơ sở", async () => {
    const [first, second] = await db.select().from(rooms).where(eq(rooms.campusId, (await db.select().from(rooms).limit(1))[0].campusId)).limit(2);
    const error = await db
      .update(rooms)
      .set({ code: first.code })
      .where(eq(rooms.id, second.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, FACILITIES_CONSTRAINT_MESSAGE), FACILITIES_CONSTRAINT_MESSAGE.rooms_campus_id_code_unique);
  });
});
