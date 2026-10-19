import { uuidv7 } from "uuidv7";

export function newId() {
  return uuidv7();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tham số đường dẫn không phải uuid thì trả 404 luôn, khỏi gửi xuống Postgres (cột uuid sẽ báo lỗi cú pháp).
export function isUuid(value: string) {
  return UUID.test(value);
}
