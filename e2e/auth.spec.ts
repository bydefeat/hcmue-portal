import { PASSWORD, SEED_ACCOUNTS, type SeedRole } from "./support/accounts";
import { anonymousTest as test, expect, signIn, signInAs } from "./support/fixtures";

// Đăng nhập sai trả 401 nên console có dòng "Failed to load resource"; đó là hành vi đúng.
const FAILED_REQUEST = /Failed to load resource: the server responded with a status of 401/;

const MENU_BUTTON: Record<SeedRole, RegExp> = {
  student: /Phạm Gia Đạt/,
  // Cổng giảng viên để menu tài khoản ở thanh trên (nút biểu tượng).
  lecturer: /^Tài khoản$/,
  admin: /Trần Minh Khoa/,
};

test.describe("đăng nhập và đăng xuất", () => {
  for (const role of ["student", "lecturer", "admin"] as const) {
    test(`${role} đăng nhập về trang chủ của vai trò rồi đăng xuất`, async ({ page }) => {
      await signInAs(page, role);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Trang vừa tải có thể chưa gắn sự kiện cho nút menu, hoặc lần bấm rơi vào lúc menu đang mở dần: bấm lại tới khi về trang đăng nhập.
      const signOut = page.getByRole("menuitem", { name: "Đăng xuất" });
      await expect(async () => {
        if (!(await signOut.isVisible())) await page.getByRole("button", { name: MENU_BUTTON[role] }).click();
        await signOut.click({ timeout: 2000 });
        await page.waitForURL("**/authentication/sign-in", { timeout: 5000 });
      }).toPass({ timeout: 30_000 });

      // Phiên đã bị hủy: mở lại trang cổng thì về trang đăng nhập, giữ đường dẫn để quay lại.
      await page.goto(SEED_ACCOUNTS[role].home);
      await expect(page).toHaveURL(/\/authentication\/sign-in\?next=/);
      expect(new URL(page.url()).searchParams.get("next")).toBe(SEED_ACCOUNTS[role].home);
    });
  }
});

test.describe("đăng nhập sai", () => {
  test.use({ allowedConsoleErrors: [FAILED_REQUEST] });

  test("sai mật khẩu báo lỗi chung, không lộ tài khoản có tồn tại", async ({ page }) => {
    await signIn(page, SEED_ACCOUNTS.lecturer.login, "SaiMatKhau@1");
    await expect(page.locator(".ant-alert")).toHaveText("Sai tên đăng nhập hoặc mật khẩu");
    await expect(page.getByLabel("Mật khẩu")).toHaveValue("");
    await expect(page).toHaveURL(/\/authentication\/sign-in/);

    await signIn(page, "50.01.104.999", "SaiMatKhau@1");
    await expect(page.locator(".ant-alert")).toHaveText("Sai tên đăng nhập hoặc mật khẩu");
  });

  test("đăng nhập bằng mã số, không bằng email (sinh viên lẫn cán bộ)", async ({ page }) => {
    await page.goto("/authentication/sign-in");
    await page.getByLabel("Tên đăng nhập").fill("5001104009@student.hcmue.edu.vn");
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.getByText("Đăng nhập bằng mã số sinh viên hoặc mã số cán bộ, giảng viên").first()).toBeVisible();
    await expect(page).toHaveURL(/\/authentication\/sign-in/);

    // Server cũng chặn khi gọi thẳng API, kể cả đúng mật khẩu.
    const response = await page.request.post("/api/auth/sign-in/email", {
      data: { email: "5001104009@student.hcmue.edu.vn", password: PASSWORD },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).code).toBe("USE_LOGIN_CODE");
    // Giảng viên cũng vậy: email công vụ không còn là tên đăng nhập.
    const lecturer = await page.request.post("/api/auth/sign-in/email", {
      data: { email: "hanhpt@hcmue.edu.vn", password: PASSWORD },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(lecturer.status()).toBe(401);
    expect((await lecturer.json()).code).toBe("USE_LOGIN_CODE");
  });
});

test.describe("MSSV nhập dạng nào cũng được", () => {
  test("10 chữ số liền không có dấu chấm", async ({ page }) => {
    await signIn(page, SEED_ACCOUNTS.student.login.replace(/\./g, ""));
    await page.waitForURL("**/application/dashboard");
  });
});

test.describe("?next= sau đăng nhập", () => {
  test("quay lại trang đang mở dở trong cổng của mình", async ({ page }) => {
    await page.goto("/application/grades");
    await expect(page).toHaveURL(/\/authentication\/sign-in\?next=/);
    await page.getByLabel("Tên đăng nhập").fill(SEED_ACCOUNTS.student.login);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await page.waitForURL("**/application/grades");
    await expect(page.getByRole("heading", { name: "Kết quả học tập" })).toBeVisible();
  });

  for (const next of ["/%09/evil.com", "//evil.com", "/\\evil.com", "https://evil.com"]) {
    test(`next=${next} không chuyển ra trang ngoài`, async ({ page }) => {
      await page.goto(`/authentication/sign-in?next=${encodeURIComponent(next).replace(/%25/g, "%")}`);
      await page.getByLabel("Tên đăng nhập").fill(SEED_ACCOUNTS.lecturer.login);
      await page.getByLabel("Mật khẩu").fill(PASSWORD);
      await page.getByRole("button", { name: "Đăng nhập" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/authentication"));
      const url = new URL(page.url());
      expect(url.host).toBe(new URL(test.info().project.use.baseURL!).host);
      expect(url.pathname).toBe("/lecturer");
    });
  }

  test("đã đăng nhập mà mở trang đăng nhập với next độc thì vẫn ở lại trong cổng", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/authentication/sign-in?next=//evil.com");
    await expect(page).toHaveURL(/\/administrator$/);
  });
});
