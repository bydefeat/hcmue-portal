// Ngày, giờ, hạn nộp đều tính theo giờ Việt Nam (dayjs dùng múi giờ của tiến trình). Máy chủ thường chạy UTC: lệch 7 giờ làm
// hạn nộp sai một ngày và HTML render ở server khác ở trình duyệt (lỗi hydration). Node áp TZ mới ngay khi gán.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") process.env.TZ = "Asia/Ho_Chi_Minh";
}
