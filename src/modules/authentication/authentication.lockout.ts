import "server-only";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { signInFailures } from "@/modules/authentication/authentication.schema";
import { SIGN_IN_LOCKOUT } from "@/modules/authentication/authentication.constant";
import type { db, Transaction } from "@/shared/libs/db.lib";

type Database = typeof db | Transaction;

const WINDOW = sql.raw(`interval '${SIGN_IN_LOCKOUT.windowMinutes} minutes'`);
const LOCK = sql.raw(`interval '${SIGN_IN_LOCKOUT.lockMinutes} minutes'`);

export async function reserveSignInAttempt(database: Database, username: string) {
  const current = signInFailures;
  const isLocked = sql`${current.lockedUntil} > now()`;
  const isFresh = sql`(${current.lockedUntil} IS NOT NULL OR ${current.windowStartedAt} <= now() - ${WINDOW})`;
  const [row] = await database
    .insert(signInFailures)
    .values({ username, failures: 1, windowStartedAt: sql`now()` })
    .onConflictDoUpdate({
      target: signInFailures.username,
      set: {
        failures: sql`CASE WHEN ${isLocked} THEN ${current.failures} WHEN ${isFresh} THEN 1 ELSE ${current.failures} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${isLocked} THEN ${current.windowStartedAt} WHEN ${isFresh} THEN now() ELSE ${current.windowStartedAt} END`,
        lockedUntil: sql`CASE WHEN ${isLocked} THEN ${current.lockedUntil} WHEN NOT ${isFresh} AND ${current.failures} + 1 > ${SIGN_IN_LOCKOUT.maxFailures} THEN now() + ${LOCK} ELSE NULL END`,
      },
    })
    .returning({ locked: sql<boolean>`coalesce(${signInFailures.lockedUntil} > now(), false)` });
  return row?.locked === true;
}

export async function lockIfTooManyFailures(database: Database, username: string) {
  const locked = await database
    .update(signInFailures)
    .set({ lockedUntil: sql`now() + ${LOCK}` })
    .where(and(eq(signInFailures.username, username), isNull(signInFailures.lockedUntil), sql`${signInFailures.failures} >= ${SIGN_IN_LOCKOUT.maxFailures}`))
    .returning({ username: signInFailures.username });
  return locked.length > 0;
}

export async function clearSignInFailures(database: Database, usernames: string[]) {
  if (usernames.length === 0) return;
  await database.delete(signInFailures).where(inArray(signInFailures.username, usernames));
}

export async function sweepSignInFailures(database: Database) {
  const removed = await database
    .delete(signInFailures)
    .where(
      and(
        lt(signInFailures.windowStartedAt, sql`now() - ${WINDOW}`),
        or(isNull(signInFailures.lockedUntil), lt(signInFailures.lockedUntil, sql`now()`)),
      ),
    )
    .returning({ username: signInFailures.username });
  return { removed: removed.length };
}
