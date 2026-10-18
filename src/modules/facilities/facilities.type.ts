export type RoomType = "lecture" | "lab" | "hall" | "seminar";

export type RoomStatus = "active" | "maintenance";

export type Campus = {
  id: string;
  name: string;
  address: string;
};

export type Room = {
  id: string;
  code: string;
  campusId: string;
  building: string;
  floor: number;
  capacity: number;
  examCapacity: number;
  type: RoomType;
  equipment: string[];
  status: RoomStatus;
  note: string;
};
