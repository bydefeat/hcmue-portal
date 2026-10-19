import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { getPgError, isPgError, isRetryablePgError, PG_ERROR, pgErrorMessage, withRetry } from "@/shared/libs/pg-error.lib";
import { REGISTRATION_CONSTRAINT_MESSAGE } from "@/modules/course-registration/course-registration.constant";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";

function fakePgError(code: string) {
  return Object.assign(Object.create(postgres.PostgresError.prototype) as postgres.PostgresError, { code, message: `fake ${code}` });
}

after(() => db.$client.end());

describe("pg-error.lib", () => {
  test("bóc lỗi Postgres ra khỏi DrizzleQueryError và nhận đúng mã unique_violation", async () => {
    const [course] = await db.select().from(courses).limit(1);
    const error = await db
      .insert(courses)
      .values({ ...course, id: undefined, createdAt: undefined, updatedAt: undefined })
      .then(() => null)
      .catch((caught: unknown) => caught);
    const pgError = getPgError(error);
    assert.ok(pgError);
    assert.equal(pgError.code, PG_ERROR.UNIQUE_VIOLATION);
    assert.equal(pgError.constraint_name, "courses_code_unique");
    assert.ok(isPgError(error, PG_ERROR.UNIQUE_VIOLATION));
    assert.equal(isRetryablePgError(error), false);
    assert.equal(pgErrorMessage(error), "Dữ liệu này đã tồn tại.");
  });

  test("tra câu báo theo tên ràng buộc của module", async () => {
    const error = await db
      .update(terms)
      .set({ isCurrent: true })
      .where(eq(terms.code, "hk2-2026"))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(getPgError(error)?.code, PG_ERROR.UNIQUE_VIOLATION);
    assert.equal(pgErrorMessage(error, REGISTRATION_CONSTRAINT_MESSAGE), "Đã có học kỳ khác được đánh dấu là học kỳ hiện tại.");
  });

  test("lỗi không phải của Postgres trả câu chung", () => {
    assert.equal(getPgError(new Error("khác")), null);
    assert.match(pgErrorMessage(new Error("khác")), /Không lưu được dữ liệu/);
  });

  test("withRetry thử lại khi xung đột serializable, không thử lại lỗi dữ liệu", async () => {
    let calls = 0;
    const value = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("bọc ngoài", { cause: fakePgError(PG_ERROR.SERIALIZATION_FAILURE) });
      return "ok";
    });
    assert.equal(value, "ok");
    assert.equal(calls, 3);

    let checkCalls = 0;
    await assert.rejects(
      withRetry(async () => {
        checkCalls++;
        throw fakePgError(PG_ERROR.CHECK_VIOLATION);
      }),
    );
    assert.equal(checkCalls, 1);
  });
});
