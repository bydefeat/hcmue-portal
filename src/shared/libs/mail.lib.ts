import "server-only";
import { env } from "@/shared/libs/env.lib";

export type MailMessage = {
  to: string | string[];
  subject: string;
  // Nội dung chữ thuần; bản HTML dựng từ đây nếu không truyền html.
  text: string;
  html?: string;
};

export type MailResult = { ok: true; id: string | null } | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Resend nhận tối đa 50 người nhận mỗi thư; gửi nhiều người thì tách lô.
const MAX_RECIPIENTS = 50;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textToHtml(text: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#18181b">${text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}

// Gửi một thư. Chưa cấu hình DEFEAT_RESEND_API_KEY thì in thư ra log server và coi như gửi được, để môi trường phát triển chạy đủ luồng.
// Lỗi gửi không ném ra: nơi gọi quyết định báo người dùng hay bỏ qua (thông báo trên cổng vẫn là kênh chính).
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const recipients = [...new Set([message.to].flat().map((address) => address.trim()).filter(Boolean))];
  if (recipients.length === 0) return { ok: true, id: null };
  if (!env.DEFEAT_RESEND_API_KEY) {
    console.warn(`[mail] Chưa cấu hình DEFEAT_RESEND_API_KEY, thư "${message.subject}" tới ${recipients.join(", ")}:\n${message.text}`);
    return { ok: true, id: null };
  }
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.DEFEAT_RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.DEFEAT_MAIL_FROM,
        to: recipients,
        subject: message.subject,
        text: message.text,
        html: message.html ?? textToHtml(message.text),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok) {
      // Không ghi tiêu đề vào log: tiêu đề thư OTP chứa mã.
      console.error(`[mail] Resend từ chối thư tới ${recipients.length} người nhận: ${response.status} ${body?.message ?? ""}`);
      return { ok: false, error: body?.message ?? `HTTP ${response.status}` };
    }
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    console.error(`[mail] Không gửi được thư tới ${recipients.length} người nhận:`, error);
    return { ok: false, error: error instanceof Error ? error.message : "Không gửi được thư" };
  }
}

// Gửi cùng một thư cho nhiều người, mỗi người một thư riêng (không lộ địa chỉ của nhau), tối đa MAX_RECIPIENTS thư một lô song song.
export async function sendMailEach(recipients: string[], message: Omit<MailMessage, "to">) {
  const unique = [...new Set(recipients.map((address) => address.trim()).filter(Boolean))];
  let sent = 0;
  for (let start = 0; start < unique.length; start += MAX_RECIPIENTS) {
    const results = await Promise.all(unique.slice(start, start + MAX_RECIPIENTS).map((to) => sendMail({ ...message, to })));
    sent += results.filter((result) => result.ok).length;
  }
  return { sent, failed: unique.length - sent };
}
