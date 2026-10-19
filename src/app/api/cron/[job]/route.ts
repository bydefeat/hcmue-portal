import { timingSafeEqual } from "node:crypto";
import { env } from "@/shared/libs/env.lib";

// Tác vụ định kỳ, gọi từ bộ hẹn giờ ngoài (cron của máy chủ, Vercel Cron, ...): POST /api/cron/<tác vụ>
// với header Authorization: Bearer <DEFEAT_CRON_SECRET>. Mỗi tác vụ phải chạy lặp lại được (gọi hai lần không sinh trùng).
// Thêm tác vụ: viết hàm trong module (trả số việc đã làm) rồi đăng ký vào JOBS.
const JOBS: Record<string, () => Promise<Record<string, number>>> = {};

function authorized(request: Request) {
  if (!env.DEFEAT_CRON_SECRET) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.DEFEAT_CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return Response.json({ error: "Không có quyền" }, { status: 401 });
  const { job } = await params;
  const run = JOBS[job];
  if (!run) return Response.json({ error: `Không có tác vụ ${job}` }, { status: 404 });
  const startedAt = Date.now();
  const result = await run();
  return Response.json({ job, ...result, durationMs: Date.now() - startedAt });
}
