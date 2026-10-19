import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { classSections, registrationEvents } from "@/modules/course-registration/course-registration.schema";
import type { RegistrationActivity } from "@/modules/course-registration/course-registration.type";

// Lượt sinh viên tự đăng ký, hủy, đổi nhóm (không tính thao tác hàng loạt của Phòng Đào tạo như hủy lớp, chuyển lớp).
const STUDENT_EVENT_KINDS = ["add", "drop", "swap"] as const;

// Nhịp đăng ký thật của một học kỳ tính từ nhật ký registration_events: 1 phút và 15 phút gần nhất, tổng trong ngày (giờ Việt Nam)
// và phút đông nhất trong ngày. Không kiểm quyền: chỉ gọi từ query đã kiểm (getRegistrationQueueStatus) hoặc test.
export async function registrationActivityOf(executor: Transaction | typeof db, termId: string, at: Date): Promise<RegistrationActivity> {
  const now = at.toISOString();
  const dayStart = sql`(date_trunc('day', ${now}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
  const scope = and(eq(classSections.termId, termId), inArray(registrationEvents.kind, [...STUDENT_EVENT_KINDS]), sql`${registrationEvents.at} >= ${dayStart}`, sql`${registrationEvents.at} <= ${now}::timestamptz`);
  const [[totals], [peak]] = await Promise.all([
    executor
      .select({
        lastMinute: sql<number>`count(*) FILTER (WHERE ${registrationEvents.at} > ${now}::timestamptz - interval '1 minute')`.mapWith(Number),
        last15Minutes: sql<number>`count(*) FILTER (WHERE ${registrationEvents.at} > ${now}::timestamptz - interval '15 minutes')`.mapWith(Number),
        studentsLast15Minutes: sql<number>`count(DISTINCT ${registrationEvents.studentId}) FILTER (WHERE ${registrationEvents.at} > ${now}::timestamptz - interval '15 minutes')`.mapWith(Number),
        today: sql<number>`count(*)`.mapWith(Number),
      })
      .from(registrationEvents)
      .innerJoin(classSections, eq(classSections.id, registrationEvents.classSectionId))
      .where(scope),
    executor
      .select({ minute: sql<Date>`date_trunc('minute', ${registrationEvents.at})`.mapWith((value: string | Date) => new Date(value)), count: sql<number>`count(*)`.mapWith(Number) })
      .from(registrationEvents)
      .innerJoin(classSections, eq(classSections.id, registrationEvents.classSectionId))
      .where(scope)
      .groupBy(sql`1`)
      .orderBy(sql`2 DESC`, sql`1 DESC`)
      .limit(1),
  ]);
  return {
    lastMinute: totals?.lastMinute ?? 0,
    last15Minutes: totals?.last15Minutes ?? 0,
    studentsLast15Minutes: totals?.studentsLast15Minutes ?? 0,
    today: totals?.today ?? 0,
    peakPerMinute: peak?.count ?? 0,
    peakAt: peak ? peak.minute.toISOString() : null,
  };
}
