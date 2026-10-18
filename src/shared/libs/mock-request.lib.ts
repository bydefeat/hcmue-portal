import { connection } from "next/server";

export async function mockDelay(milliseconds = 120) {
  await connection();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
