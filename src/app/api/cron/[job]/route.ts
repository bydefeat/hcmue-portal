import { timingSafeEqual } from "node:crypto";
import { env } from "@/shared/libs/env.lib";
import { publishDueClassAnnouncements } from "@/modules/teaching/teaching.lib";
import { sweepOrphanExamFiles } from "@/modules/exams/exams.lib";
import { sweepOrphanRequestFiles } from "@/modules/requests/requests.lib";

// Tác vụ định kỳ, gọi từ bộ hẹn giờ ngoài (cron của máy chủ, Vercel Cron, ...): POST /api/cron/<tác vụ>
// với header Authorization: Bearer <DEFEAT_CRON_SECRET>. Mỗi tác vụ phải chạy lặp lại được (gọi hai lần không sinh trùng).
// Thêm tác vụ: viết hàm trong module (trả số việc đã làm) rồi đăng ký vào JOBS.
const JOBS: Record<string, () => Promise<Record<string, number>>> = {
  // Báo sinh viên (cổng + email nếu bật) các thông báo lớp hẹn giờ đã tới giờ đăng. Nên chạy mỗi 5 phút.
  "class-announcements": () => publishDueClassAnnouncements(),
  // Tệp trong kho không còn dòng DB nào trỏ tới (giao dịch hỏng giữa chừng, bản đề thi cũ chưa xóa được).
  "orphan-files": async () => ({ ...(await sweepOrphanRequestFiles()), ...(await sweepOrphanExamFiles()) }),
};

function authorized(request: Request) {
  if (!env.DEFEAT_CRON_SECRET) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.DEFEAT_CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return Response.json({ error: "Không có quyền" }, { status: 401 });
  const { job } = await params;
  // Object.hasOwn: tên như "constructor" không được trỏ vào thuộc tính kế thừa của object.
  const run = Object.hasOwn(JOBS, job) ? JOBS[job] : undefined;
  if (!run) return Response.json({ error: `Không có tác vụ ${job}` }, { status: 404 });
  const startedAt = Date.now();
  const result = await run();
  return Response.json({ job, ...result, durationMs: Date.now() - startedAt });
}
