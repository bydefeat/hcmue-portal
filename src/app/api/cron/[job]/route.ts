import { timingSafeEqual } from "node:crypto";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { publishDueAnnouncements } from "@/modules/announcements/announcements.lib";
import { purgeOldAuditLogs } from "@/modules/audit/audit.lib";
import { sweepSignInFailures } from "@/modules/authentication/authentication.lockout";
import { convertOverdueIncompletes } from "@/modules/grades/grade-amendments.lib";
import { runAcademicWarningsJob } from "@/modules/grades/grades.lib";
import { runMailOutboxJob } from "@/modules/mail/mail.lib";
import { purgeOldNotifications } from "@/modules/notifications/notifications.lib";
import { publishDueClassAnnouncements } from "@/modules/teaching/teaching.lib";
import { refreshExamStatuses, sweepOrphanExamFiles } from "@/modules/exams/exams.lib";
import { runRequestSlaJob, sweepOrphanRequestFiles } from "@/modules/requests/requests.lib";
import { purgeReportExports } from "@/modules/settings/settings.lib";
import { runDecisionEffectsJob } from "@/modules/users/users.decision";
import { resyncOpenClassSessions } from "@/modules/schedule/schedule.lib";
import { expireWaitlists } from "@/modules/course-registration/course-registration.lib";
import { sealClosedSurveys } from "@/modules/surveys/surveys.lib";

const JOBS: Record<string, () => Promise<Record<string, number>>> = {
  "class-announcements": () => publishDueClassAnnouncements(),
  "announcement-notifications": () => publishDueAnnouncements(),
  "orphan-files": async () => ({ ...(await sweepOrphanRequestFiles()), ...(await sweepOrphanExamFiles()) }),
  "academic-warnings": runAcademicWarningsJob,
  "incomplete-grades": () => convertOverdueIncompletes(),
  "mail-outbox": runMailOutboxJob,
  "sign-in-failures": () => sweepSignInFailures(db),
  "request-sla": () => runRequestSlaJob(),
  "notifications-cleanup": () => purgeOldNotifications(),
  "report-exports": () => purgeReportExports(),
  "audit-cleanup": () => purgeOldAuditLogs(),
  "decision-effects": runDecisionEffectsJob,
  "class-sessions": () => resyncOpenClassSessions(db),
  "exam-sessions": () => refreshExamStatuses(),
  surveys: sealClosedSurveys,
  "waitlist-expiry": () => db.transaction((tx) => expireWaitlists(tx, new Date())),
};

function matches(given: Buffer, secret: string | undefined) {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function authorized(request: Request) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return matches(given, env.DEFEAT_CRON_SECRET) || matches(given, env.CRON_SECRET);
}

async function run(request: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return Response.json({ error: "Không có quyền" }, { status: 401 });
  const { job } = await params;
  const task = Object.hasOwn(JOBS, job) ? JOBS[job] : undefined;
  if (!task) return Response.json({ error: `Không có tác vụ ${job}` }, { status: 404 });
  const startedAt = Date.now();
  try {
    const result = await task();
    return Response.json({ job, ...result, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error(`[cron] Tác vụ ${job} lỗi sau ${Date.now() - startedAt} ms:`, error);
    return Response.json({ job, error: `Tác vụ ${job} gặp lỗi, xem log máy chủ.` }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
