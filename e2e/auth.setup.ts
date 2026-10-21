import { anonymousTest as setup, expect, signInAs } from "./support/fixtures";
import { STATE } from "./support/accounts";

for (const role of ["student", "lecturer"] as const) {
  setup(`lưu phiên ${role}`, async ({ page }) => {
    await signInAs(page, role);
    await page.context().storageState({ path: STATE[role] });
  });
}

setup("lưu phiên Phòng Đào tạo và Quản trị hệ thống", async ({ page }) => {
  await signInAs(page, "admin");
  await page.context().storageState({ path: STATE.admin });

  const target = page.getByRole("button", { name: /Quản trị hệ thống/ });
  const submenu = page.getByRole("menuitem", { name: /Đổi vai trò/ });
  await expect(async () => {
    if (!(await submenu.isVisible())) await page.getByRole("button", { name: /Trần Minh Khoa/ }).click();
    await submenu.hover();
    await submenu.press("ArrowRight");
    await expect(target).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await target.evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForURL("**/administrator");
  await expect(async () => {
    await page.getByRole("button", { name: /Trần Minh Khoa/ }).click();
    await expect(page.getByRole("menu").getByText("Quản trị hệ thống").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.context().storageState({ path: STATE.system });
});
