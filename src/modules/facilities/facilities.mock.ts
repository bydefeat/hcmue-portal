import type { Campus, Room } from "@/modules/facilities/facilities.type";

export const CAMPUSES: Campus[] = [
  { id: "adv", name: "Cơ sở An Dương Vương", address: "280 An Dương Vương, Phường Chợ Quán, TP. Hồ Chí Minh" },
  { id: "lvs", name: "Cơ sở Lê Văn Sỹ", address: "222 Lê Văn Sỹ, Phường Nhiêu Lộc, TP. Hồ Chí Minh" },
  { id: "la", name: "Phân hiệu Long An", address: "934 Quốc lộ 1A, Phường Khánh Hậu, Tỉnh Tây Ninh" },
];

export const ROOMS: Room[] = [
  { id: "a201", code: "A.201", campusId: "adv", building: "Nhà A", floor: 2, capacity: 60, examCapacity: 40, type: "lecture", equipment: ["Máy chiếu", "Loa, micro", "Điều hòa"], status: "active", note: "" },
  { id: "a203", code: "A.203", campusId: "adv", building: "Nhà A", floor: 2, capacity: 50, examCapacity: 34, type: "lecture", equipment: ["Máy chiếu", "Điều hòa"], status: "active", note: "" },
  { id: "a305", code: "A.305", campusId: "adv", building: "Nhà A", floor: 3, capacity: 45, examCapacity: 30, type: "lecture", equipment: ["Máy chiếu", "Điều hòa"], status: "active", note: "" },
  { id: "b302", code: "B.302", campusId: "adv", building: "Nhà B", floor: 3, capacity: 50, examCapacity: 34, type: "lecture", equipment: ["Tivi", "Điều hòa", "Camera"], status: "active", note: "" },
  { id: "b405", code: "B.405", campusId: "adv", building: "Nhà B", floor: 4, capacity: 45, examCapacity: 30, type: "lecture", equipment: ["Máy chiếu", "Điều hòa"], status: "active", note: "" },
  { id: "b408", code: "B.408", campusId: "adv", building: "Nhà B", floor: 4, capacity: 45, examCapacity: 30, type: "lecture", equipment: ["Máy chiếu"], status: "maintenance", note: "Sửa điều hòa đến hết tuần sau" },
  { id: "c301", code: "C.301 (Phòng máy)", campusId: "adv", building: "Nhà C", floor: 3, capacity: 40, examCapacity: 40, type: "lab", equipment: ["Máy tính giảng viên", "Máy tính sinh viên", "Máy chiếu", "Điều hòa"], status: "active", note: "40 máy, Windows 11, Visual Studio Code" },
  { id: "c302", code: "C.302 (Phòng máy)", campusId: "adv", building: "Nhà C", floor: 3, capacity: 40, examCapacity: 40, type: "lab", equipment: ["Máy tính giảng viên", "Máy tính sinh viên", "Bảng thông minh", "Điều hòa"], status: "active", note: "40 máy, có GPU cho học phần Học máy" },
  { id: "h204", code: "H.2.04", campusId: "lvs", building: "Nhà H", floor: 2, capacity: 50, examCapacity: 34, type: "lecture", equipment: ["Máy chiếu", "Điều hòa"], status: "active", note: "" },
  { id: "h311", code: "H.3.11", campusId: "lvs", building: "Nhà H", floor: 3, capacity: 35, examCapacity: 24, type: "seminar", equipment: ["Tivi", "Loa, micro", "Điều hòa"], status: "active", note: "Phòng học ngoại ngữ, bàn ghế xếp nhóm" },
  { id: "i101", code: "I.101 (Hội trường)", campusId: "adv", building: "Nhà I", floor: 1, capacity: 120, examCapacity: 80, type: "hall", equipment: ["Máy chiếu", "Loa, micro", "Điều hòa", "Camera"], status: "active", note: "" },
  { id: "la105", code: "LA.105", campusId: "la", building: "Giảng đường 1", floor: 1, capacity: 60, examCapacity: 40, type: "lecture", equipment: ["Máy chiếu"], status: "active", note: "" },
];
