import { test as base, expect, type Browser, type Locator, type Page, type Response } from "@playwright/test";
import { PASSWORD, SEED_ACCOUNTS, STATE, type SeedRole } from "./accounts";

type Fixtures = {
  consoleErrors: string[];
  allowedConsoleErrors: RegExp[];
};

export const test = base.extend<Fixtures>({
  allowedConsoleErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors: string[] = [];
      const record = (text: string) => {
        if (!allowedConsoleErrors.some((pattern) => pattern.test(text))) errors.push(text);
      };
      page.on("console", (message) => {
        if (message.type() === "error") record(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => record(`pageerror: ${error.message}`));
      await use(errors);
      expect(errors, "Trang có lỗi console hoặc lỗi JavaScript").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export function asRole(role: keyof typeof STATE) {
  return { storageState: STATE[role] };
}

let ipCounter = 0;

export function freshIp() {
  ipCounter += 1;
  return `10.${(process.pid % 200) + 20}.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export const anonymousTest = test.extend({
  storageState: async ({}, use) => use({ cookies: [], origins: [] }),
  extraHTTPHeaders: async ({}, use) => use({ "x-forwarded-for": freshIp() }),
});

export async function openAs(browser: Browser, role: keyof typeof STATE) {
  const context = await browser.newContext({ storageState: STATE[role], baseURL: test.info().project.use.baseURL, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  return context.newPage();
}

export async function openAnonymous(browser: Browser) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    baseURL: test.info().project.use.baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    extraHTTPHeaders: { "x-forwarded-for": freshIp() },
  });
  return context.newPage();
}

export async function waitForHydration(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate((element) => {
          type Fiber = { alternate: Fiber | null; flags: number; return: Fiber | null; tag: number };
          const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
          if (!key) return false;
          const fiber = (element as unknown as Record<string, Fiber>)[key];
          let nearest: Fiber | null = fiber;
          let node = fiber;
          for (let next: Fiber | null = fiber; next && !next.alternate; next = node.return) {
            node = next;
            if ((node.flags & 4098) !== 0) nearest = node.return;
          }
          while (node.return) node = node.return;
          return node.tag === 3 && nearest === fiber;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function signIn(page: Page, login: string, password = PASSWORD) {
  await page.goto("/authentication/sign-in");
  const submit = page.getByRole("button", { name: "Đăng nhập" });
  await waitForHydration(submit);
  await page.getByLabel("Tên đăng nhập").fill(login);
  await page.getByLabel("Mật khẩu").fill(password);
  await submit.click();
}

export async function signInAs(page: Page, role: SeedRole) {
  await signIn(page, SEED_ACCOUNTS[role].login);
  await page.waitForURL(`**${SEED_ACCOUNTS[role].home}`);
}

export function waitForAction(page: Page): Promise<Response> {
  return page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
}

export function vietnamDate(days = 0) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export async function chooseOption(page: Page, field: Locator, option: string | RegExp, { search }: { search?: string } = {}) {
  const listId = `${await field.getAttribute("id")}_list`;
  const dropdown = page.locator(".ant-select-dropdown").filter({ has: page.locator(`[id="${listId}"]`) });
  const item = dropdown.locator(".ant-select-item-option").filter({ hasText: option }).first();
  const holder = dropdown.locator(".ant-select-dropdown-list-holder");
  const select = field.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' ant-select ')][1]");
  const multiple = await select.evaluate((element) => element.classList.contains("ant-select-multiple"));
  const isSelected = async () => /\bant-select-item-option-selected\b/.test((await item.getAttribute("class", { timeout: 1000 }).catch(() => null)) ?? "");
  await expect(async () => {
    if (!(await dropdown.isVisible())) await field.click({ timeout: 2000 });
    await expect(dropdown).toBeVisible({ timeout: 2000 });
    if (search && (await field.inputValue()) !== search) await field.fill(search);
    for (let step = 0; step < 40 && !(await item.isVisible()); step += 1) {
      await holder.hover();
      await page.mouse.wheel(0, 96);
    }
    if (multiple) {
      if (!(await isSelected())) await item.click({ timeout: 2000 });
      await expect(item).toHaveClass(/\bant-select-item-option-selected\b/, { timeout: 2000 });
    } else {
      await item.click({ timeout: 2000 });
      await expect(dropdown).toBeHidden({ timeout: 2000 });
      await expect(select).toContainText(option, { timeout: 2000 });
    }
  }).toPass({ timeout: 30_000 });
}

export function toast(page: Page, text: string | RegExp) {
  return page.locator(".ant-message-notice").filter({ hasText: text });
}

export function dialog(page: Page, title: string | RegExp) {
  return page.getByRole("dialog", { name: title });
}
