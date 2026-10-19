import type { Page } from "@playwright/test";
import { anonymousTest, asRole, expect, test } from "./support/fixtures";

// Mỗi trang mở được với đúng vai trò: không lỗi console/pageerror (fixture tự kiểm), nội dung chính không có "undefined"/"NaN",
// không cuộn ngang ở bề rộng 375px. Id trong đường dẫn là id tất định của seed (mockId).
const LECTURER_CLASS = "/lecturer/classes/01940000-0000-7cf6-8e9d-061ac04964c4";
const STUDENT_CLASS = "/application/classes/01940000-0000-71d7-86de-be61a4f0a489";

const PUBLIC_PAGES = [
  "/",
  "/about",
  "/announcements",
  "/announcements/dang-ky-hoc-phan-hk2-2026-2027-dot-1",
  "/authentication/sign-in",
  "/authentication/forgot-password",
  "/authentication/forgot-password?activate=1",
  "/authentication/verify",
];

const STUDENT_PAGES = [
  "/application/dashboard",
  "/application/schedule",
  "/application/registration",
  "/application/registration/history",
  "/application/curriculum",
  "/application/study-plan",
  "/application/grades",
  "/application/exams",
  "/application/tuition",
  "/application/requests",
  "/application/classes",
  STUDENT_CLASS,
  "/application/advising",
  "/application/surveys",
  "/application/notifications",
  "/application/profile",
];

const LECTURER_PAGES = [
  "/lecturer",
  "/lecturer/schedule",
  "/lecturer/classes",
  LECTURER_CLASS,
  `${LECTURER_CLASS}/attendance`,
  `${LECTURER_CLASS}/grading`,
  `${LECTURER_CLASS}/syllabus`,
  `${LECTURER_CLASS}/announcements`,
  "/lecturer/exams",
  "/lecturer/workload",
  "/lecturer/advising/students",
  "/lecturer/advising/students/49.01.104.008",
  "/lecturer/advising/study-plans",
  "/lecturer/advising/academic-warnings",
  "/lecturer/advising/appointments",
  "/lecturer/requests",
  "/lecturer/notifications",
  "/lecturer/profile",
];

// Vai trò mặc định của tài khoản Phòng Đào tạo (Trưởng phòng Đào tạo).
const ADMIN_PAGES = [
  "/administrator",
  "/administrator/announcements",
  "/administrator/programs",
  "/administrator/courses",
  "/administrator/terms",
  "/administrator/class-sections",
  "/administrator/teaching-assignments",
  "/administrator/rooms",
  "/administrator/registration-monitor",
  "/administrator/registration-holds",
  "/administrator/grade-publishing",
  "/administrator/exams",
  "/administrator/exams/eligibility",
  "/administrator/graduation",
  "/administrator/tuition",
  "/administrator/requests",
  "/administrator/decisions",
  "/administrator/users/students",
  "/administrator/users/students/49.01.104.008",
  "/administrator/users/lecturers",
  "/administrator/users/advisors",
  "/administrator/reports",
  "/administrator/reports/academic-warnings",
  "/administrator/reports/exports",
  "/administrator/reports/surveys",
  "/administrator/settings",
  "/administrator/settings/calendar",
  "/administrator/notifications",
  "/administrator/profile",
];

// Trang chỉ vai trò Quản trị hệ thống vào được.
const SYSTEM_PAGES = ["/administrator/settings/access", "/administrator/settings/audit-log"];

// Đường dẫn chuyển hướng: chỉ cần đến đúng trang đích.
const REDIRECTS: [role: "student" | "lecturer" | "admin", from: string, to: RegExp][] = [
  ["student", "/application", /\/application\/dashboard$/],
  ["lecturer", "/lecturer/advising", /\/lecturer\/advising\/students$/],
  ["admin", "/administrator/users", /\/administrator\/users\/students$/],
];

async function checkPage(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `HTTP của ${path}`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  const main = page.locator("main").first();
  const text = await ((await main.count()) ? main : page.locator("body")).innerText();
  expect(text, `${path} hiện "undefined"/"NaN"`).not.toMatch(/\bundefined\b|\bNaN\b/);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${path} cuộn ngang ở 375px` })
    .toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 720 });
}

anonymousTest.describe.configure({ mode: "parallel" });

anonymousTest.describe("trang công khai", () => {
  for (const path of PUBLIC_PAGES) anonymousTest(path, async ({ page }) => checkPage(page, path));
});

for (const [role, pages] of [
  ["student", STUDENT_PAGES],
  ["lecturer", LECTURER_PAGES],
  ["admin", ADMIN_PAGES],
  ["system", SYSTEM_PAGES],
] as const) {
  test.describe(`cổng ${role}`, () => {
    test.use(asRole(role));
    for (const path of pages) test(path, async ({ page }) => checkPage(page, path));
  });
}

test.describe("trang chi tiết chương trình đào tạo", () => {
  test.use(asRole("admin"));
  test("mở chương trình đầu tiên trong danh sách", async ({ page }) => {
    await page.goto("/administrator/programs");
    const href = await page.locator('main a[href^="/administrator/programs/"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    await checkPage(page, href!);
  });
});

for (const [role, from, to] of REDIRECTS) {
  test.describe(`chuyển hướng ${from}`, () => {
    test.use(asRole(role));
    test(from, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    });
  });
}
