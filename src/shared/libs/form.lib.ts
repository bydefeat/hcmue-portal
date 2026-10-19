// Lỗi theo ô từ server action ("equipment.0") → dạng form.setFields của antd, gắn vào ô cấp đầu.
// name để kiểu never vì tên ô đến từ server, form nào nhận cũng gán được mà không cần ép kiểu ở chỗ gọi.
export function toFormFields(fieldErrors: Record<string, string> | undefined) {
  return Object.entries(fieldErrors ?? {}).map(([path, error]) => ({ name: path.split(".")[0] as never, errors: [error] }));
}
