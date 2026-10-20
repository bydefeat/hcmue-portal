import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { TransactionRollbackError, and, eq, gte } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { registrationActivityOf } from "@/modules/course-registration/course-registration.lib";
import { classSections, enrollments, registrationEvents } from "@/modules/course-registration/course-registration.schema";

after(() => db.$client.end());

describe("theo dõi đăng ký: nhịp đăng ký từ registration_events", () => {
  test("đếm lượt 1 phút, 15 phút, trong ngày giờ Việt Nam và phút đông nhất; bỏ thao tác của Phòng Đào tạo", async () => {
    // Thời điểm không có dữ liệu mẫu để số đếm chỉ gồm các dòng thêm trong test (12:00 giờ Việt Nam).
    const now = new Date("2031-03-10T05:00:00Z");
    const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
    await db
      .transaction(async (tx) => {
        const [section] = await tx.select({ id: classSections.id, termId: classSections.termId }).from(classSections).where(and(eq(classSections.status, "open"), gte(classSections.enrolledCount, 3))).limit(1);
        const roster = await tx
          .select({ studentId: enrollments.studentId })
          .from(enrollments)
          .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.status, "enrolled")))
          .limit(3);
        const [a, b, c] = roster.map((row) => row.studentId);
        const event = (studentId: string, at: Date, kind: "add" | "drop" | "swap" | "section-cancelled" = "add") => ({ studentId, classSectionId: section.id, kind, actorLabel: "Thử", channel: "Kiểm thử", at });
        await tx.insert(registrationEvents).values([
          event(a, ago(20)),
          event(b, ago(40), "drop"),
          event(a, ago(5 * 60), "swap"),
          // Phút đông nhất: 3 lượt cùng phút 11:40.
          event(a, new Date("2031-03-10T04:40:05Z")),
          event(b, new Date("2031-03-10T04:40:30Z")),
          event(c, new Date("2031-03-10T04:40:59Z")),
          // Không tính: thao tác hàng loạt, hôm qua (giờ Việt Nam), sau thời điểm xem.
          event(c, ago(10), "section-cancelled"),
          event(c, new Date("2031-03-09T16:59:00Z")),
          event(c, new Date(now.getTime() + 60_000)),
        ]);
        const activity = await registrationActivityOf(tx, section.termId, now);
        assert.deepEqual(
          { ...activity },
          { lastMinute: 2, last15Minutes: 3, studentsLast15Minutes: 2, today: 6, peakPerMinute: 3, peakAt: "2031-03-10T04:40:00.000Z" },
        );
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
  });
});
