import { z } from "zod";
import { EQUIPMENT_OPTIONS } from "@/modules/facilities/facilities.constant";

const EQUIPMENT = EQUIPMENT_OPTIONS.map((option) => option.value) as [string, ...string[]];

// Dùng chung cho form (client) và server action; DB còn chặn thêm bằng CHECK rooms_exam_capacity_range.
export const ROOM_UPDATE_SCHEMA = z
  .object({
    id: z.uuid(),
    type: z.enum(["lecture", "lab", "hall", "seminar"]),
    capacity: z.int("Chưa nhập").min(1, "Ít nhất 1 chỗ").max(300, "Tối đa 300 chỗ"),
    examCapacity: z.int("Chưa nhập").min(1, "Ít nhất 1 chỗ").max(300, "Tối đa 300 chỗ"),
    equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).transform((items) => [...new Set(items)]),
    status: z.enum(["active", "maintenance"]),
    note: z.string().trim().max(200, "Tối đa 200 ký tự"),
  })
  .refine((room) => room.examCapacity <= room.capacity, { path: ["examCapacity"], message: "Không vượt quá chỗ ngồi học" });

export type RoomUpdateInput = z.input<typeof ROOM_UPDATE_SCHEMA>;
