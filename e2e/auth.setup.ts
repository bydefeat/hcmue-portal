import { anonymousTest as setup, expect, signInAs } from "./support/fixtures";
import { STATE } from "./support/accounts";

// Đăng nhập một lần cho mỗi vai trò rồi lưu phiên: các test khác dùng lại phiên này nên không chạm giới hạn 5 lần đăng nhập/phút.
for (const role of ["student", "lecturer"] as const) {
  setup(`lưu phiên ${role}`, async ({ page }) => {
    await signInAs(page, role);
    await page.context().storageState({ path: STATE[role] });
  });
}

setup("lưu phiên Phòng Đào tạo và Quản trị hệ thống", async ({ page }) => {
  await signInAs(page, "admin");
  await page.context().storageState({ path: STATE.admin });

  // Cùng phiên, đổi vai trò đang dùng sang Quản trị hệ thống (cookie riêng của cổng quản trị).
  await page.getByRole("button", { name: /Trần Minh Khoa/ }).click();
  await page.getByRole("menuitem", { name: "Đổi vai trò" }).hover();
  await page.getByRole("button", { name: /Quản trị hệ thống/ }).click();
  await page.waitForURL("**/administrator");
  await page.getByRole("button", { name: /Trần Minh Khoa/ }).click();
  await expect(page.getByRole("menu").getByText("Quản trị hệ thống").first()).toBeVisible();
  await page.context().storageState({ path: STATE.system });
});
