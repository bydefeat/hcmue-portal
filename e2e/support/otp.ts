import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import postgres from "postgres";

const OTP_IN_LOG = /HCMUE Portal: (\d{6})/;

export function serverLogSize() {
  const path = process.env.E2E_SERVER_LOG;
  try {
    return path ? statSync(path).size : null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function otpFromLog(email: string, from: number, timeout: number) {
  const path = process.env.E2E_SERVER_LOG!;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const lines = readFileSync(path).subarray(from).toString("utf8").split("\n");
    const otp = lines
      .filter((line) => line.includes(email))
      .map((line) => OTP_IN_LOG.exec(line)?.[1])
      .findLast(Boolean);
    if (otp) return otp;
    await sleep(250);
  }
  return null;
}

async function replaceOtpInDatabase(identifier: string, timeout: number) {
  const sql = postgres(process.env.DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL!, { max: 1, onnotice: () => {} });
  const otp = String(100_000 + Math.floor(Math.random() * 900_000));
  const value = `${createHash("sha256").update(otp).digest("base64url")}:0`;
  try {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const rows = await sql`update verification set value = ${value} where identifier = ${identifier} and expires_at > now() returning id`;
      if (rows.length > 0) return otp;
      await sleep(250);
    }
    return null;
  } finally {
    await sql.end();
  }
}

export async function otpFor(email: string, type: "forget-password" | "email-verification", logStart: number | null) {
  if (logStart !== null) {
    const otp = await otpFromLog(email, logStart, 8000);
    if (otp) return otp;
  }
  return replaceOtpInDatabase(`${type}-otp-${email}`, 10_000);
}

