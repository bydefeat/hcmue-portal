import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/shared/libs/db.lib";
import { seedCatalog } from "./seed/catalog.seed";
import type { SeedContext } from "./seed/context";
import { seedExams } from "./seed/exams.seed";
import { seedGrades } from "./seed/grades.seed";
import { seedGraduation } from "./seed/graduation.seed";
import { seedAdvising } from "./seed/advising.seed";
import { seedPeople } from "./seed/people.seed";
import { seedRegistration } from "./seed/registration.seed";
import { seedRequests } from "./seed/requests.seed";
import { seedSchedule } from "./seed/schedule.seed";
import { seedSettings } from "./seed/settings.seed";
import { seedSurveys } from "./seed/surveys.seed";
import { seedTuition } from "./seed/tuition.seed";
import { seedAnnouncements } from "./seed/announcements.seed";
import { seedNotifications } from "./seed/notifications.seed";
import { seedAudit } from "./seed/audit.seed";
import { seedStudyPlan } from "./seed/study-plan.seed";
import { seedTeaching } from "./seed/teaching.seed";

if (process.env.NODE_ENV === "production") throw new Error("Không chạy seed trên môi trường production");

const PASSWORD = process.env.DEFEAT_SEED_ACCOUNT_PASSWORD || "Hcmue@2026";

// Nạp toàn bộ dữ liệu mẫu vào Postgres với đúng id của *.mock.ts (mockId), để module đã đọc DB và module còn đọc mock khớp nhau.
// Thứ tự theo khóa ngoại: danh mục → người → đăng ký học phần → cấu hình.
async function main() {
  const context = { passwordHash: await hashPassword(PASSWORD) } as SeedContext;
  const summary = await db.transaction(async (tx) => {
    const tables = await tx.execute<{ tablename: string }>(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    await tx.execute(sql.raw(`TRUNCATE ${tables.map((row) => `"${row.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`));
    const catalog = await seedCatalog(tx, context);
    const people = await seedPeople(tx, context);
    const registration = await seedRegistration(tx, context);
    await seedGrades(tx, context);
    await seedGraduation(tx, context);
    await seedTeaching(tx, context);
    await seedStudyPlan(tx, context);
    await seedAdvising(tx, context);
    await seedRequests(tx, context);
    await seedSchedule(tx, context);
    await seedExams(tx, context);
    await seedSurveys(tx, context);
    await seedSettings(tx, context);
    await seedTuition(tx, context);
    await seedAnnouncements(tx, context);
    await seedNotifications(tx, context);
    await seedAudit(tx, context);
    return { catalog, people, registration };
  });
  const { catalog, people, registration } = summary;
  console.log(
    [
      `Đã seed ${catalog.courses} học phần, ${catalog.programs} chương trình, ${people.students} sinh viên, ${people.lecturers} giảng viên,`,
      `${registration.terms} học kỳ, ${registration.sections} lớp học phần, ${registration.enrollments} lượt đăng ký.`,
      `Tài khoản (mật khẩu ${PASSWORD === "Hcmue@2026" ? "mặc định Hcmue@2026" : "từ DEFEAT_SEED_ACCOUNT_PASSWORD"}):`,
      ...people.accounts.map((line) => `  - ${line}`),
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
