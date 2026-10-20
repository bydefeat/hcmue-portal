import { timingSafeEqual } from "node:crypto";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { publishDueAnnouncements } from "@/modules/announcements/announcements.lib";
import { purgeOldAuditLogs } from "@/modules/audit/audit.lib";
import { sweepSignInFailures } from "@/modules/authentication/authentication.lockout";
import { runAcademicWarningsJob } from "@/modules/grades/grades.lib";
import { runMailOutboxJob } from "@/modules/mail/mail.lib";
import { purgeOldNotifications } from "@/modules/notifications/notifications.lib";
import { publishDueClassAnnouncements } from "@/modules/teaching/teaching.lib";
import { sweepOrphanExamFiles } from "@/modules/exams/exams.lib";
import { runRequestSlaJob, sweepOrphanRequestFiles } from "@/modules/requests/requests.lib";
import { purgeReportExports } from "@/modules/settings/settings.lib";
import { runDecisionEffectsJob } from "@/modules/users/users.decision";

// Tác vụ định kỳ, gọi từ bộ hẹn giờ ngoài (crontab của máy chủ, Vercel Cron...): GET hoặc POST /api/cron/<tác vụ> với header
// Authorization: Bearer <khóa>, khóa là DEFEAT_CRON_SECRET hoặc CRON_SECRET (Vercel Cron tự gửi CRON_SECRET bằng GET).
// Mỗi tác vụ phải chạy lặp lại được (gọi hai lần không sinh trùng). Lịch chạy đề nghị ở docs/ARCHITECTURE.md và vercel.json.
// Thêm tác vụ: viết hàm trong module (trả số việc đã làm) rồi đăng ký vào JOBS.
const JOBS: Record<string, () => Promise<Record<string, number>>> = {
  // Báo sinh viên (cổng + email nếu bật) các thông báo lớp hẹn giờ đã tới giờ đăng. Nên chạy mỗi 5 phút.
  "class-announcements": () => publishDueClassAnnouncements(),
  // Thông báo chung hẹn giờ đã tới giờ đăng mà có chọn gửi thông báo cá nhân, email. Nên chạy mỗi 5 phút.
  "announcement-notifications": () => publishDueAnnouncements(),
  // Tệp trong kho không còn dòng DB nào trỏ tới (giao dịch hỏng giữa chừng, bản đề thi cũ chưa xóa được).
  "orphan-files": async () => ({ ...(await sweepOrphanRequestFiles()), ...(await sweepOrphanExamFiles()) }),
  // Cảnh báo học vụ của học kỳ chính vừa kết thúc; chạy lặp lại không sinh trùng. Nên chạy mỗi ngày.
  "academic-warnings": runAcademicWarningsJob,
  // Gửi thư trong hàng đợi chưa đi được (lỗi Resend, tiến trình chết giữa chừng), lùi lịch thư lỗi, xóa thư đã gửi quá 30 ngày.
  // Nên chạy mỗi 1 đến 5 phút: lịch gửi lại ngắn nhất là 1 phút.
  "mail-outbox": runMailOutboxJob,
  // Dọn bộ đếm đăng nhập sai đã hết hạn (tên dò bừa không tồn tại để lại dòng). Nên chạy mỗi ngày.
  "sign-in-failures": () => sweepSignInFailures(db),
  // Nhắc người xử lý bước đơn sắp hết hạn (dưới 24 giờ) và đã quá hạn, mỗi loại một lần. Nên chạy mỗi giờ.
  "request-sla": () => runRequestSlaJob(),
  // Xóa thông báo cá nhân đã đọc quá 180 ngày, chưa đọc quá 365 ngày. Nên chạy mỗi ngày.
  "notifications-cleanup": () => purgeOldNotifications(),
  // Xóa lịch sử xuất báo cáo quá 30 ngày cùng tệp trong kho, tệp báo cáo mồ côi. Nên chạy mỗi ngày.
  "report-exports": () => purgeReportExports(),
  // Xóa nhật ký thao tác cũ hơn DEFEAT_AUDIT_RETENTION_DAYS (mặc định 3 năm). Nên chạy mỗi tuần.
  "audit-cleanup": () => purgeOldAuditLogs(),
  // Quyết định sinh viên đã ký trước ngày hiệu lực: tới ngày thì đổi tình trạng, lớp của sinh viên. Nên chạy mỗi ngày, sau 0 giờ.
  "decision-effects": runDecisionEffectsJob,
};

function matches(given: Buffer, secret: string | undefined) {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function authorized(request: Request) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return matches(given, env.DEFEAT_CRON_SECRET) || matches(given, env.CRON_SECRET);
}

async function run(request: Request, { params }: { params: Promise<{ job: string }> }) {
  // Chưa đặt khóa nào thì endpoint tắt: mọi lời gọi đều 401.
  if (!authorized(request)) return Response.json({ error: "Không có quyền" }, { status: 401 });
  const { job } = await params;
  // Object.hasOwn: tên như "constructor" không được trỏ vào thuộc tính kế thừa của object.
  const task = Object.hasOwn(JOBS, job) ? JOBS[job] : undefined;
  if (!task) return Response.json({ error: `Không có tác vụ ${job}` }, { status: 404 });
  const startedAt = Date.now();
  try {
    const result = await task();
    return Response.json({ job, ...result, durationMs: Date.now() - startedAt });
  } catch (error) {
    // Chi tiết lỗi (câu SQL, đường dẫn) chỉ ghi log máy chủ, phản hồi chỉ nói tác vụ nào lỗi.
    console.error(`[cron] Tác vụ ${job} lỗi sau ${Date.now() - startedAt} ms:`, error);
    return Response.json({ job, error: `Tác vụ ${job} gặp lỗi, xem log máy chủ.` }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
