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
  // Menu con "Đổi vai trò" mở khi rê chuột, nhưng ở bản build rê chuột không phải lúc nào cũng mở: mở thêm bằng phím mũi tên phải, thử lại tới khi hiện.
  const target = page.getByRole("button", { name: /Quản trị hệ thống/ });
  const submenu = page.getByRole("menuitem", { name: /Đổi vai trò/ });
  await expect(async () => {
    if (!(await submenu.isVisible())) await page.getByRole("button", { name: /Trần Minh Khoa/ }).click();
    await submenu.hover();
    await submenu.press("ArrowRight");
    await expect(target).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  // Di chuột từ menu con sang nút thì menu con đóng lại trước khi bấm (rê qua vùng nội dung): bấm trực tiếp trên phần tử.
  await target.evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForURL("**/administrator");
  // Trang vừa chuyển có thể chưa gắn sự kiện: bấm lại tới khi menu tài khoản mở và ghi vai trò mới.
  await expect(async () => {
    await page.getByRole("button", { name: /Trần Minh Khoa/ }).click();
    await expect(page.getByRole("menu").getByText("Quản trị hệ thống").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.context().storageState({ path: STATE.system });
});
