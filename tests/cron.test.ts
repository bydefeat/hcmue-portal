import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { GET, POST } from "@/app/api/cron/[job]/route";

after(() => db.$client.end());

const call = (handler: typeof GET, job: string, authorization?: string) =>
  handler(new Request(`http://localhost/api/cron/${job}`, { headers: authorization ? { authorization } : {} }), { params: Promise.resolve({ job }) });

describe("cron: xác thực và chạy tác vụ", () => {
  const secret = env.DEFEAT_CRON_SECRET ?? env.CRON_SECRET;

  test("thiếu hoặc sai khóa thì 401, tác vụ không có thì 404", async () => {
    assert.equal((await call(GET, "sign-in-failures")).status, 401);
    assert.equal((await call(GET, "sign-in-failures", "Bearer sai-khoa")).status, 401);
    if (!secret) return;
    assert.equal((await call(GET, "khong-co", `Bearer ${secret}`)).status, 404);
    assert.equal((await call(GET, "constructor", `Bearer ${secret}`)).status, 404);
  });

  test("Vercel Cron gọi GET, bộ hẹn giờ khác gọi POST, cùng khóa; trả số việc đã làm", async (context) => {
    if (!secret) {
      context.skip("Chưa đặt DEFEAT_CRON_SECRET hoặc CRON_SECRET trong .env");
      return;
    }
    for (const handler of [GET, POST]) {
      const response = await call(handler, "sign-in-failures", `Bearer ${secret}`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as { job: string; durationMs: number };
      assert.equal(body.job, "sign-in-failures");
      assert.equal(typeof body.durationMs, "number");
    }
  });
});
