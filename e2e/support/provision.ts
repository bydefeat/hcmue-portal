import { inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/shared/libs/db.lib";
import { createAccounts, lockAccountProfiles } from "@/modules/users/users.account";
import { students } from "@/modules/users/users.schema";
import { E2E_ACCOUNTS, PASSWORD } from "./accounts";

async function main() {
  const codes = Object.values(E2E_ACCOUNTS).map((entry) => entry.code.replace(/\D/g, ""));
  const rows = await db.select({ id: students.id }).from(students).where(inArray(students.code, codes));
  if (rows.length !== codes.length) throw new Error(`Seed thiếu sinh viên ${codes.join(", ")} dùng cho e2e`);
  const passwordHash = await hashPassword(PASSWORD);
  await db.transaction(async (tx) => {
    const profiles = await lockAccountProfiles(
      tx,
      "student",
      rows.map((row) => row.id),
    );
    await createAccounts(
      tx,
      profiles,
      profiles.map(() => passwordHash),
    );
  });
  console.log(`e2e: đã cấp tài khoản ${codes.join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
