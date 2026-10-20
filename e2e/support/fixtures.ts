import { test as base, expect, type Browser, type Locator, type Page, type Response } from "@playwright/test";
import { PASSWORD, SEED_ACCOUNTS, STATE, type SeedRole } from "./accounts";

type Fixtures = {
  // Lỗi console/pageerror của trang; tự kiểm cuối mỗi test. Test cố ý gây lỗi mạng (sai mật khẩu, 404) khai báo mẫu được bỏ qua.
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

// IP giả cho từng phiên đăng nhập mới: rate limit đăng nhập (5 lần/phút) tính theo IP trong x-forwarded-for, không có IP thì mọi
// request chung một bucket. Mỗi test tự đăng nhập dùng một IP riêng để không đụng giới hạn của nhau.
export function freshIp() {
  ipCounter += 1;
  return `10.${(process.pid % 200) + 20}.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

// Test bắt đầu khi chưa đăng nhập, mỗi test một IP riêng.
export const anonymousTest = test.extend({
  storageState: async ({}, use) => use({ cookies: [], origins: [] }),
  extraHTTPHeaders: async ({}, use) => use({ "x-forwarded-for": freshIp() }),
});

// Mở thêm một trang với phiên đã lưu của vai trò khác, ví dụ để sinh viên xem kết quả thao tác của Phòng Đào tạo.
export async function openAs(browser: Browser, role: keyof typeof STATE) {
  const context = await browser.newContext({ storageState: STATE[role], baseURL: test.info().project.use.baseURL, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  return context.newPage();
}

// Mở thêm một trang chưa đăng nhập, IP riêng. `browser.newContext()` trong test nhận mặc định của `test.use` (kể cả storageState của
// vai trò) nên phải ghi rõ storageState rỗng, không thì trang đăng nhập chuyển thẳng vào cổng của vai trò đó.
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

// Phần tử đã được React hydrate (có props và trình xử lý sự kiện). Bấm trước lúc đó thì không có tác dụng, hoặc với nút submit thì
// trình duyệt tự gửi form theo kiểu HTML thuần (tải lại trang, mất dữ liệu đã nhập). Hay gặp ở `next start` khi trang vừa tải.
// Có `__reactProps$` thôi chưa đủ: React gắn props khi đang hydrate (chia nhỏ theo lượt), sự kiện chỉ tới được phần tử khi lượt hydrate
// đã commit. Kiểm như `getNearestMountedFiber` của react-dom: không còn fiber tổ tiên mới tạo mang cờ Placement/Hydrating (4098).
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

// Chờ một server action trả về (request POST có header Next-Action).
export function waitForAction(page: Page): Promise<Response> {
  return page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
}

// Ngày theo giờ Việt Nam dạng DD/MM/YYYY (ô ngày của antd nhận gõ trực tiếp), lệch `days` ngày so với hôm nay.
export function vietnamDate(days = 0) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

// Chọn một mục trong Select của antd theo ô (combobox). Danh sách là danh sách ảo, chỉ vẽ vài mục quanh vị trí cuộn: ô có showSearch thì
// truyền `search` để lọc, không thì lăn chuột trong danh sách tới khi mục cần chọn hiện ra. Popup nhận ra theo id danh sách của ô
// (`<id>_list`), không theo "popup mở cuối cùng" vì popup vừa đóng còn đang chạy hiệu ứng. Lần bấm có khi trượt (danh sách vừa lọc
// xong còn vẽ lại): kiểm đã chọn rồi mới thôi; ô chọn nhiều thì không bấm lại mục đã chọn (bấm lại là bỏ chọn).
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

// Thông báo nổi (message của antd).
export function toast(page: Page, text: string | RegExp) {
  return page.locator(".ant-message-notice").filter({ hasText: text });
}

// Drawer và Modal của antd đều là role="dialog" mang tên theo tiêu đề.
export function dialog(page: Page, title: string | RegExp) {
  return page.getByRole("dialog", { name: title });
}
