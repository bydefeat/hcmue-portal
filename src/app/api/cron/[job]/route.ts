import { timingSafeEqual } from "node:crypto";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { sweepSignInFailures } from "@/modules/authentication/authentication.lockout";
import { runAcademicWarningsJob } from "@/modules/grades/grades.lib";
import { runMailOutboxJob } from "@/modules/mail/mail.lib";
import { publishDueClassAnnouncements } from "@/modules/teaching/teaching.lib";
import { sweepOrphanExamFiles } from "@/modules/exams/exams.lib";
import { sweepOrphanRequestFiles } from "@/modules/requests/requests.lib";
import { runDecisionEffectsJob } from "@/modules/users/users.decision";
import { resyncOpenClassSessions } from "@/modules/schedule/schedule.lib";

// Tác vụ định kỳ, gọi từ bộ hẹn giờ ngoài (cron của máy chủ, Vercel Cron, ...): POST /api/cron/<tác vụ>
// với header Authorization: Bearer <DEFEAT_CRON_SECRET>. Mỗi tác vụ phải chạy lặp lại được (gọi hai lần không sinh trùng).
// Thêm tác vụ: viết hàm trong module (trả số việc đã làm) rồi đăng ký vào JOBS.
const JOBS: Record<string, () => Promise<Record<string, number>>> = {
  // Báo sinh viên (cổng + email nếu bật) các thông báo lớp hẹn giờ đã tới giờ đăng. Nên chạy mỗi 5 phút.
  "class-announcements": () => publishDueClassAnnouncements(),
  // Tệp trong kho không còn dòng DB nào trỏ tới (giao dịch hỏng giữa chừng, bản đề thi cũ chưa xóa được).
  "orphan-files": async () => ({ ...(await sweepOrphanRequestFiles()), ...(await sweepOrphanExamFiles()) }),
  // Cảnh báo học vụ của học kỳ chính vừa kết thúc; chạy lặp lại không sinh trùng. Nên chạy mỗi ngày.
  "academic-warnings": runAcademicWarningsJob,
  // Gửi thư trong hàng đợi chưa đi được (lỗi Resend, tiến trình chết giữa chừng), lùi lịch thư lỗi, xóa thư đã gửi quá 30 ngày.
  // Nên chạy mỗi 1 đến 5 phút: lịch gửi lại ngắn nhất là 1 phút.
  "mail-outbox": runMailOutboxJob,
  // Dọn bộ đếm đăng nhập sai đã hết hạn (tên dò bừa không tồn tại để lại dòng). Nên chạy mỗi ngày.
  "sign-in-failures": () => sweepSignInFailures(db),
  // Quyết định sinh viên đã ký trước ngày hiệu lực: tới ngày thì đổi tình trạng, lớp của sinh viên. Nên chạy mỗi ngày, sau 0 giờ.
  "decision-effects": runDecisionEffectsJob,
  // Sinh lại buổi học của các lớp đang mở theo ngày nghỉ lễ mới nhất của lịch năm học. Nên chạy mỗi ngày.
  "class-sessions": () => resyncOpenClassSessions(db),
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
