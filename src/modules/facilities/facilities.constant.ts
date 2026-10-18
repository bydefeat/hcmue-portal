import type { StatusMeta } from "@/shared/constants/status.constant";
import type { RoomStatus, RoomType } from "./facilities.type";

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
