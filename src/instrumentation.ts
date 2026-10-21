export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") process.env.TZ = "Asia/Ho_Chi_Minh";
}
