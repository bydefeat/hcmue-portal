import { anonymousTest, asRole, expect, test } from "./support/fixtures";

const ERROR_STATUS = /Failed to load resource: the server responded with a status of 40[34]/;

test.describe.configure({ mode: "parallel" });
test.use({ allowedConsoleErrors: [ERROR_STATUS] });

test.describe("sinh viên", () => {
  test.use(asRole("student"));

  for (const path of ["/lecturer", "/lecturer/classes", "/administrator", "/administrator/users/students"]) {
    test(`không vào được ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
      await expect(page.getByRole("heading", { name: "Bạn chưa được cấp quyền xem trang này" })).toBeVisible();
    });
  }

  test("không mở được tệp minh chứng của đơn người khác", async ({ page }) => {
    const response = await page.request.get("/api/files/requests/01940000-0000-7000-8000-000000000000");
    expect(response.status()).toBe(404);
  });
});

test.describe("giảng viên", () => {
  test.use(asRole("lecturer"));

  test("không vào được cổng Phòng Đào tạo", async ({ page }) => {
    const response = await page.goto("/administrator");
    expect(response?.status()).toBe(403);
  });

  test("lớp không dạy thì báo Không tìm thấy", async ({ page }) => {
    await page.goto("/lecturer/classes/01940000-0000-7f6a-bbd5-16f374a105ba");
    await expect(page.getByText("Không tìm thấy").first()).toBeVisible();
    await expect(page.getByText("Lập trình cơ bản")).toHaveCount(0);
  });

  test("lớp không dạy cũng không mở được trang nhập điểm", async ({ page }) => {
    await page.goto("/lecturer/classes/01940000-0000-7f6a-bbd5-16f374a105ba/grading");
    await expect(page.getByText("Không tìm thấy").first()).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
  });
});

test.describe("đường dẫn sai trong cổng trả HTTP 404", () => {
  for (const [role, path] of [
    ["student", "/application/khong-co"],
    ["student", "/application/classes/khong-phai-uuid"],
    ["lecturer", "/lecturer/khong-co/trang-con"],
    ["lecturer", "/lecturer/classes/123"],
    ["admin", "/administrator/khong-co"],
    ["admin", "/administrator/programs/khong-phai-uuid"],
  ] as const) {
    test.describe(role, () => {
      test.use(asRole(role));
      test(path, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(404);
        await expect(page.getByText("Không tìm thấy").first()).toBeVisible();
      });
    });
  }
});

anonymousTest.describe("chưa đăng nhập", () => {
  anonymousTest.use({ allowedConsoleErrors: [ERROR_STATUS] });

  anonymousTest("trang cổng chuyển về đăng nhập kèm next", async ({ page }) => {
    await page.goto("/lecturer/classes");
    await expect(page).toHaveURL(/\/authentication\/sign-in\?next=%2Flecturer%2Fclasses$/);
  });

  anonymousTest("đường dẫn công khai không tồn tại trả 404", async ({ page }) => {
    const response = await page.goto("/trang-khong-ton-tai");
    expect(response?.status()).toBe(404);
  });

  anonymousTest("API tải tệp không trả gì khi chưa đăng nhập", async ({ page }) => {
    const response = await page.request.get("/api/files/requests/01940000-0000-7000-8000-000000000000");
    expect([401, 404]).toContain(response.status());
  });
});
