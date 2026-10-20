import { readFile } from "node:fs/promises";
import { E2E_ACCOUNTS, PASSWORD } from "./support/accounts";
import { asRole, chooseOption, dialog, expect, freshIp, signIn, test, toast, waitForAction } from "./support/fixtures";

test.use(asRole("student"));

// PDF nhỏ hợp lệ (chữ ký %PDF- ở đầu tệp là thứ server kiểm).
const SAMPLE_PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

test("tổng quan hiện điểm, tín chỉ, lịch học hôm nay", async ({ page }) => {
  await page.goto("/application/dashboard");
  await expect(page.getByRole("heading", { name: "Tổng quan", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Điểm trung bình tích lũy 3,71/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tín chỉ tích lũy 65\/130/ })).toBeVisible();
  await expect(page.getByText("Lịch học hôm nay")).toBeVisible();
  await page.getByRole("link", { name: "Đến trang đăng ký" }).click();
  await expect(page).toHaveURL(/\/application\/registration$/);
});

test("thời khóa biểu theo tuần và xuất lịch .ics", async ({ page }) => {
  await page.goto("/application/schedule");
  await expect(page.getByRole("heading", { name: "Thời khóa biểu" })).toBeVisible();
  await expect(page.getByRole("link", { name: /COMP1020\.02 Cấu trúc dữ liệu và giải thuật/ })).toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất lịch .ics" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const content = await readFile(await download.path(), "utf8");
  expect(content).toContain("BEGIN:VCALENDAR");
  expect(content).toContain("COMP1020.02");
});

test.describe("đăng ký học phần", () => {
  test("đăng ký một lớp hợp lệ rồi hủy", async ({ page }) => {
    await page.goto("/application/registration");
    // Thẻ lớp trong danh sách (có thanh sĩ số), khác dòng cùng mã trong giỏ "Lớp đã chọn".
    const row = page.getByRole("listitem").filter({ has: page.getByRole("progressbar", { name: "Đã đăng ký MATH2001.01" }) });
    const basket = page.getByRole("complementary").filter({ hasText: "Lớp đã chọn" });
    await row.getByRole("button", { name: "Chọn lớp" }).click();
    await expect(toast(page, "Đã chọn lớp MATH2001.01")).toBeVisible();

    await page.getByRole("button", { name: "Đăng ký 1 lớp" }).first().click();
    await expect(toast(page, /Đã đăng ký 1 lớp/)).toBeVisible();
    await expect(row).toContainText("Đã đăng ký");

    // Tải lại vẫn còn: chỗ đã giữ ở DB.
    await page.reload();
    const registered = basket.getByRole("listitem").filter({ hasText: "MATH2001.01" });
    await expect(registered).toContainText("Đã đăng ký");

    await registered.getByRole("button", { name: "Hủy" }).click();
    const confirm = page.getByRole("dialog").filter({ hasText: "Hủy đăng ký MATH2001.01?" });
    await confirm.getByRole("button", { name: "Hủy đăng ký" }).click();
    await expect(toast(page, "Đã hủy đăng ký MATH2001.01")).toBeVisible();
    await page.reload();
    await expect(basket.getByRole("listitem").filter({ hasText: "MATH2001.01" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Chọn lớp" })).toBeEnabled();
  });

  test("lớp bị chặn hiện lý do và không chọn được", async ({ page }) => {
    await page.goto("/application/registration");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("progressbar", { name: "Đã đăng ký PHYS1010.01" }) });
    await expect(row.getByText("Chưa đạt học phần tiên quyết PHYS1001 Cơ học")).toBeVisible();
    await expect(row.getByText(/Trùng lịch với COMP1180\.01/)).toBeVisible();
    await expect(row.getByRole("button", { name: "Chọn lớp" })).toBeDisabled();

    const full = page.getByRole("listitem").filter({ has: page.getByRole("progressbar", { name: "Đã đăng ký ENGL2001.01" }) });
    await expect(full.getByText(/đã đủ 30\/30 chỗ/)).toBeVisible();
  });
});

test("kết quả học tập theo học kỳ", async ({ page }) => {
  await page.goto("/application/grades");
  await expect(page.getByRole("heading", { name: "Kết quả học tập" })).toBeVisible();
  await expect(page.locator("main")).toContainText(/Điểm trung bình tích lũy\s*3,71/);
  const term = page.getByRole("button", { name: /Học kỳ 1, năm học 2025-2026/ });
  await term.click();
  await expect(term).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("table").last().getByRole("row").nth(1)).toBeVisible();
});

test("học phí hiện số phải nộp và nội dung chuyển khoản", async ({ page }) => {
  await page.goto("/application/tuition");
  await expect(page.getByRole("heading", { name: "Học kỳ 1, năm học 2026-2027", level: 2 })).toBeVisible();
  // Có cả hóa đơn tạm tính của học kỳ đang đăng ký: kiểm dòng tổng của học kỳ hiện tại.
  await expect(page.getByRole("listitem").filter({ hasText: "Tổng phải nộp" }).filter({ hasText: "7.503.600 đ" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Nội dung/ }).filter({ hasText: "HP 5001104009 HK1-2026" })).toBeVisible();
});

test("gửi đơn kèm tệp PDF, tải lại được tệp, rồi hủy đơn", async ({ page }) => {
  await page.goto("/application/requests");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  const form = dialog(page, "Tạo đơn mới");
  await chooseOption(page, form.getByLabel("Loại đơn"), "Xin mở lớp học phần");
  const course = `MATH2002 Giải tích 3 (e2e ${Date.now()})`;
  await form.getByLabel("Mã và tên học phần").fill(course);
  await form.getByLabel("Số sinh viên cùng đề nghị").fill("12");
  await form.getByLabel("Lý do").fill("Nhiều sinh viên cần học trong học kỳ này để kịp tiến độ.");
  await form.locator('input[type="file"]').setInputFiles({ name: "danh-sach-de-nghi.pdf", mimeType: "application/pdf", buffer: SAMPLE_PDF });
  await expect(form.getByText("danh-sach-de-nghi.pdf")).toBeVisible();
  await form.getByRole("button", { name: "Gửi đơn" }).click();
  const sent = toast(page, /Đã gửi đơn DT-/);
  await expect(sent).toBeVisible();
  const code = /DT-\d{4}-\d{5}/.exec((await sent.textContent()) ?? "")![0];

  await page.reload();
  const row = page.getByRole("row", { name: new RegExp(`^${code} `) });
  await expect(row).toContainText(course);
  await expect(row).toContainText("Chờ tiếp nhận");
  await row.getByRole("button", { name: code }).click();
  const detail = dialog(page, `Xin mở lớp học phần · ${code}`);
  const link = detail.getByRole("link", { name: "danh-sach-de-nghi.pdf" });
  await expect(link).toBeVisible();

  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["content-disposition"]).toContain("danh-sach-de-nghi.pdf");
  expect(Buffer.compare(await response.body(), SAMPLE_PDF)).toBe(0);

  await detail.getByRole("button", { name: "Hủy đơn" }).click();
  await dialog(page, `Hủy đơn ${code}?`).getByRole("button", { name: "Hủy đơn" }).click();
  await expect(toast(page, `Đã hủy đơn ${code}`)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(`^${code} `) })).toContainText("Đã hủy");
});

test("lớp học phần: thông báo và đề cương", async ({ page }) => {
  await page.goto("/application/classes");
  await page.getByRole("link", { name: /Cấu trúc dữ liệu và giải thuật COMP1020\.02/ }).click();
  await expect(page.getByRole("heading", { name: "Cấu trúc dữ liệu và giải thuật", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Đề cương và cách tính điểm/ })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /CLO1\s*Phân tích được độ phức tạp/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "hanhpt@hcmue.edu.vn" })).toBeVisible();
});

test("lịch hẹn cố vấn", async ({ page }) => {
  await page.goto("/application/advising");
  await expect(page.getByRole("heading", { name: "Lịch hẹn cố vấn" })).toBeVisible();
  await expect(page.getByText(/Sinh hoạt lớp định kỳ/).first()).toBeVisible();
  await expect(page.getByText("Cố vấn lớp 50.01.CNTT.A")).toBeVisible();
});

test("kế hoạch học tập đã duyệt chỉ xem, không sửa", async ({ page }) => {
  await page.goto("/application/study-plan");
  await expect(page.getByRole("heading", { name: "Kế hoạch học tập" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đã được duyệt" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Học kỳ 2, năm học 2026-2027", level: 2 })).toBeVisible();
  await expect(page.getByText("Nhận xét của cố vấn")).toBeVisible();
});

test("thông báo: đánh dấu đã đọc hết, tải lại vẫn đã đọc", async ({ page }) => {
  await page.goto("/application/notifications");
  const examNotice = page.getByRole("link", { name: /Lịch thi giữa kỳ đã có/ });
  await expect(examNotice).toHaveAccessibleName(/chưa đọc/);
  // Giao diện đổi ngay khi bấm; chờ server lưu xong rồi mới tải lại.
  const saved = waitForAction(page);
  await page.getByRole("button", { name: "Đánh dấu đã đọc hết" }).click();
  await expect(examNotice).not.toHaveAccessibleName(/chưa đọc/);
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("link", { name: /Lịch thi giữa kỳ đã có/ })).not.toHaveAccessibleName(/chưa đọc/);
});

test.describe("tài khoản riêng của e2e", () => {
  test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": freshIp() } });

test("đổi mật khẩu rồi đổi lại", async ({ page }) => {
  const account = E2E_ACCOUNTS.passwordChanger;
  const changed = "E2e@Doi-Mat-Khau1";
  const change = async (from: string, to: string) => {
    await page.goto("/application/profile");
    await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
    const modal = dialog(page, "Đổi mật khẩu");
    await modal.getByLabel("Mật khẩu hiện tại").fill(from);
    await modal.getByLabel("Mật khẩu mới", { exact: true }).fill(to);
    await modal.getByLabel("Nhập lại mật khẩu mới").fill(to);
    await modal.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(toast(page, "Đã đổi mật khẩu")).toBeVisible();
  };

  await signIn(page, account.code);
  await page.waitForURL("**/application/dashboard");
  await change(PASSWORD, changed);

  // Phiên hiện tại vẫn dùng được; đăng nhập lại phải bằng mật khẩu mới.
  await page.context().clearCookies();
  await signIn(page, account.code, changed);
  await page.waitForURL("**/application/dashboard");
  await change(changed, PASSWORD);
});
});
