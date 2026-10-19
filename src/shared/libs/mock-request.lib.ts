import { connection } from "next/server";

const MOCK_DELAY_MS = Number(process.env.MOCK_DELAY_MS ?? 0);

export async function mockDelay(milliseconds = MOCK_DELAY_MS) {
  await connection();
  if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
