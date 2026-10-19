import type { StatusMeta } from "@/shared/constants/status.constant";
import type { RoomStatus, RoomType } from "@/modules/facilities/facilities.type";

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  lecture: "Phòng lý thuyết",
  lab: "Phòng máy",
  hall: "Hội trường",
  seminar: "Phòng chuyên đề",
};

export const ROOM_STATUS: Record<RoomStatus, StatusMeta> = {
  active: { label: "Đang sử dụng", tone: "neutral" },
  maintenance: { label: "Đang bảo trì", tone: "warning" },
};

export const ROOM_TYPE_OPTIONS = Object.entries(ROOM_TYPE_LABEL).map(([value, label]) => ({ value, label }));

export const EQUIPMENT_OPTIONS = ["Máy chiếu", "Tivi", "Loa, micro", "Điều hòa", "Máy tính giảng viên", "Máy tính sinh viên", "Bảng thông minh", "Camera"].map((value) => ({ value, label: value }));

export const FACILITIES_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  rooms_campus_id_code_unique: "Cơ sở này đã có phòng cùng mã.",
  rooms_capacity_positive: "Sức chứa phải lớn hơn 0.",
  rooms_exam_capacity_range: "Chỗ ngồi thi phải từ 1 đến số chỗ ngồi học.",
};
