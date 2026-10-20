import ExcelJS from "exceljs";
import type { Locator } from "@playwright/test";
import { E2E_ACCOUNTS, PASSWORD } from "./support/accounts";
import { asRole, chooseOption, dialog, expect, openAnonymous, signIn, test, toast, vietnamDate, waitForHydration } from "./support/fixtures";
import { otpFor, serverLogSize } from "./support/otp";

test.use(asRole("admin"));

// Mở drawer/menu bằng nút trên trang vừa tải: bấm lại tới khi `opened` hiện (lần bấm trước khi hydrate không có tác dụng).
async function openWith(trigger: Locator, opened: Locator) {
  await expect(async () => {
    if (!(await opened.isVisible())) await trigger.click({ timeout: 2000 });
    await expect(opened).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

// Ô lọc của bảng là input có kiểm soát: gõ trước khi hydrate thì chữ hiện ra nhưng bảng không lọc.
async function fillFilter(field: Locator, text: string) {
  await waitForHydration(field);
  await field.fill(text);
}

// Tích ô chọn của một dòng bảng antd tới khi ô thật sự được chọn.
async function selectRow(row: Locator) {
  const checkbox = row.getByRole("checkbox");
  await expect(async () => {
    if (!(await checkbox.isChecked())) await checkbox.check({ force: true, timeout: 2000 });
    await expect(checkbox).toBeChecked({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

test("thêm sinh viên, cấp tài khoản, sinh viên tự kích hoạt bằng mã gửi qua email", async ({ page, browser }) => {
  // MSSV, email, tên riêng của e2e (seed chỉ có số thứ tự dưới 200); global setup seed lại DB nên mỗi lần chạy đều trống.
  const serial = String(900 + (Date.now() % 100)).padStart(3, "0");
  const code = `51.01.104.${serial}`;
  const email = `5101104${serial}@student.hcmue.edu.vn`;
  const fullName = `Kiểm Thử E2e ${serial}`;

  await page.goto("/administrator/users/students");
  const form = dialog(page, "Thêm sinh viên");
  await openWith(page.getByRole("button", { name: "Thêm sinh viên" }), form);
  await form.getByLabel("Mã sinh viên").fill(code);
  await form.getByLabel("Họ và tên").fill(fullName);
  await form.getByLabel("Nữ").check();
  await form.getByLabel("Ngày sinh").fill("15/03/2007");
  await form.getByLabel("Ngày sinh").press("Enter");
  await expect(form.getByLabel("Ngày sinh")).toHaveValue("15/03/2007");
  await chooseOption(page, form.getByLabel("Ngành"), "Công nghệ thông tin", { search: "Công nghệ thông tin" });
  await chooseOption(page, form.getByLabel("Khóa", { exact: true }), "Khóa 51");
  await form.getByLabel("Lớp sinh hoạt").fill("51.01.CNTT.A");
  await form.getByLabel("Lớp sinh hoạt").press("Escape");
  await form.getByLabel("Email").fill(email);
  await expect(form.getByLabel("Cấp tài khoản và gửi thư kích hoạt")).toBeChecked();
  await form.getByRole("button", { name: "Thêm sinh viên" }).click();
  await expect(toast(page, `Đã thêm ${fullName} vào lớp 51.01.CNTT.A`)).toBeVisible();

  await fillFilter(page.getByLabel("Tìm sinh viên"), code);
  const row = page.getByRole("row").filter({ hasText: fullName });
  await expect(row).toContainText("Chưa kích hoạt");

  // Kích hoạt bằng mã OTP: đọc mã từ thư in ra log server (`next dev`), không có thì thay mã trong DB (xem support/otp.ts).
  const student = await openAnonymous(browser);
  await student.goto(`/authentication/forgot-password?email=${encodeURIComponent(email)}&activate=1`);
  await expect(student.getByRole("heading", { name: "Kích hoạt tài khoản" })).toBeVisible();
  const sendCode = student.getByRole("button", { name: "Gửi mã" });
  await waitForHydration(sendCode);
  const logStart = serverLogSize();
  await sendCode.click();
  await expect(student.getByRole("heading", { name: "Nhập mã" })).toBeVisible();
  const otp = await otpFor(email, "forget-password", logStart);
  expect(otp, "Không lấy được mã OTP").not.toBeNull();
  await student.getByRole("textbox", { name: "OTP Input 1" }).click();
  await student.keyboard.type(otp!);
  await student.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(student.getByRole("heading", { name: "Đặt mật khẩu" })).toBeVisible();
  const password = "E2e@Kich-Hoat1";
  await student.getByLabel("Mật khẩu mới").fill(password);
  await student.getByRole("button", { name: "Lưu mật khẩu" }).click();
  await expect(student.getByRole("heading", { name: "Đã kích hoạt tài khoản" })).toBeVisible();

  await signIn(student, code, password);
  await student.waitForURL("**/application/dashboard");
  await expect(student.getByRole("heading", { name: "Tổng quan", level: 1 })).toBeVisible();
  await student.context().close();

  await page.reload();
  await fillFilter(page.getByLabel("Tìm sinh viên"), code);
  await expect(page.getByRole("row").filter({ hasText: fullName })).toContainText("Đang dùng");
});

test("khóa rồi mở khóa tài khoản", async ({ page, browser }) => {
  const account = E2E_ACCOUNTS.lockable;
  const row = page.getByRole("row").filter({ hasText: account.name });
  const selectStudent = async () => {
    await fillFilter(page.getByLabel("Tìm sinh viên"), account.code);
    await selectRow(row);
  };
  // Menu thả xuống "Tài khoản khác": bấm mục trực tiếp trên phần tử (rê chuột qua vùng khác thì menu đóng trước khi bấm).
  const chooseAccountAction = async (name: string) => {
    const item = page.getByRole("menuitem", { name, exact: true });
    await openWith(page.getByRole("button", { name: "Tài khoản khác" }), item);
    await item.evaluate((element: HTMLElement) => element.click());
  };

  await page.goto("/administrator/users/students");
  await selectStudent();
  await chooseAccountAction("Khóa tài khoản");
  // Nút của hộp xác nhận có khi bấm trượt lúc hộp đang hiện dần: bấm tới khi hộp đóng (antd chặn gọi onOk hai lần).
  const confirm = dialog(page, "Khóa tài khoản của 1 sinh viên?");
  await expect(async () => {
    if (await confirm.isVisible()) await confirm.getByRole("button", { name: "Khóa tài khoản" }).click({ timeout: 2000 });
    await expect(confirm).toBeHidden({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(toast(page, "Đã khóa 1 tài khoản và đăng xuất khỏi mọi thiết bị")).toBeVisible();
  await expect(row).toContainText("Đã khóa");

  const student = await openAnonymous(browser);
  await signIn(student, account.code);
  await expect(student.locator(".ant-alert")).toHaveText("Tài khoản đang bị khóa. Liên hệ Phòng Đào tạo để được mở khóa.");
  await expect(student).toHaveURL(/\/authentication\/sign-in/);

  await page.reload();
  await selectStudent();
  await chooseAccountAction("Mở khóa tài khoản");
  await expect(toast(page, "Đã mở khóa 1 tài khoản")).toBeVisible();
  await expect(row).not.toContainText("Đã khóa");

  await signIn(student, account.code, PASSWORD);
  await student.waitForURL("**/application/dashboard");
  await student.context().close();
});

test("mở lớp học phần", async ({ page }) => {
  // Số thứ tự lớp từ 50 trở lên để không trùng lớp seed; global setup seed lại DB mỗi lần chạy.
  const number = 50 + (Date.now() % 40);
  await page.goto("/administrator/class-sections");
  const form = dialog(page, /^Mở lớp học phần, /);
  await openWith(page.getByRole("button", { name: "Mở lớp" }), form);
  await chooseOption(page, form.getByLabel("Học phần"), /^MATH1013 Xác suất thống kê/, { search: "MATH1013" });
  await form.getByLabel("Số thứ tự lớp").fill(String(number));
  await form.getByLabel("Sĩ số tối đa").fill("40");
  await form.getByLabel("Sĩ số tối thiểu").fill("10");
  // Buổi tối Chủ nhật để không trùng phòng với lớp seed.
  await chooseOption(page, form.getByLabel("Thứ", { exact: true }), "Chủ nhật");
  await chooseOption(page, form.getByLabel("Phòng", { exact: true }), /.+/);
  await chooseOption(page, form.getByLabel("Từ tiết"), /^Tiết 10 /);
  await chooseOption(page, form.getByLabel("Đến tiết"), /^Tiết 12 /);
  await form.getByRole("button", { name: "Mở lớp" }).click();
  const sectionCode = `MATH1013.${String(number).padStart(2, "0")}`;
  await expect(toast(page, `Đã mở lớp ${sectionCode}`)).toBeVisible();

  await page.reload();
  await fillFilter(page.getByLabel("Tìm lớp học phần"), sectionCode);
  await expect(page.getByRole("row").filter({ hasText: sectionCode })).toContainText("Nháp");
});

test("duyệt rồi công bố điểm một lớp", async ({ page }) => {
  await page.goto("/administrator/grade-publishing");
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "COMP1070.01 Phát triển ứng dụng web" }) });
  // Bấm trước khi trang gắn sự kiện thì không có gì xảy ra: chờ hydrate rồi bấm một lần. Không bấm lại theo thông báo: server dev có
  // khi trả lời sau vài giây, lần bấm lại rơi vào lúc nút đã biến mất và thông báo đã qua.
  const approve = row.getByRole("button", { name: "Duyệt", exact: true });
  await waitForHydration(approve);
  await approve.click();
  await expect(toast(page, "Khoa đã duyệt 1 bảng điểm")).toBeVisible();
  await expect(row).toContainText("Khoa đã duyệt");

  await row.getByRole("button", { name: "Công bố" }).click();
  await dialog(page, "Công bố điểm 1 lớp học phần?").getByRole("button", { name: "Công bố" }).click();
  await expect(toast(page, "Đã công bố điểm 1 lớp")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("row").filter({ has: page.getByRole("button", { name: "COMP1070.01 Phát triển ứng dụng web" }) })).toContainText("Đã công bố");
});

test("ghi một khoản nộp học phí", async ({ page }) => {
  // Mã tham chiếu riêng của e2e (mỗi mã chỉ ghi được một lần).
  const reference = `E2E${Date.now()}`;
  await page.goto("/administrator/tuition");
  await chooseOption(page, page.getByLabel("Trạng thái"), "Chưa nộp");
  await fillFilter(page.getByLabel("Tìm sinh viên"), "48.01");
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Chi tiết" }) }).first();
  const studentName = (await row.getByRole("link").first().textContent())!;
  const detail = dialog(page, new RegExp(`^${studentName}, `));
  await openWith(row.getByRole("button", { name: "Chi tiết" }), detail);

  await detail.getByRole("button", { name: "Ghi thanh toán" }).click();
  await detail.getByLabel("Số tiền").fill("1000000");
  // Ô ngày có giờ (định dạng DD/MM/YYYY HH:mm): gõ đúng định dạng rồi Enter để xác nhận, thay cho nút OK của bảng chọn.
  const paidAt = detail.getByLabel("Thời điểm nộp");
  const paidAtText = `${vietnamDate(-1)} 08:00`;
  await paidAt.click();
  await paidAt.fill(paidAtText);
  await paidAt.press("Enter");
  await expect(paidAt).toHaveValue(paidAtText);
  await chooseOption(page, detail.getByLabel("Hình thức"), /.+/);
  await detail.getByLabel("Mã tham chiếu").fill(reference);
  await detail.getByRole("button", { name: "Ghi nhận" }).click();
  await expect(toast(page, /Đã ghi 1\.000\.000 đ, còn nợ/)).toBeVisible();
  await expect(detail).toContainText(reference);
  await expect(detail).toContainText("Nộp thiếu");
});

test("xuất báo cáo .xlsx và đọc được bằng exceljs", async ({ page }) => {
  await page.goto("/administrator/reports/exports");
  await page.getByRole("listitem").filter({ hasText: "Tỉ lệ đăng ký học phần" }).getByRole("button", { name: "Tạo báo cáo" }).click();
  const form = dialog(page, "Tỉ lệ đăng ký học phần");
  await expect(form.getByLabel("Excel (.xlsx)").or(form.getByRole("radio").first())).toBeChecked();
  await form.getByRole("button", { name: "Tạo tệp" }).click();
  await expect(toast(page, /Đã tạo Tỉ lệ đăng ký học phần, \d+ dòng/)).toBeVisible();

  const job = page.getByRole("row").filter({ hasText: "Tỉ lệ đăng ký học phần" }).first();
  const downloading = page.waitForEvent("download");
  await job.getByRole("button", { name: "Tải về" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  expect(sheet.rowCount).toBeGreaterThan(1);
  const header = (sheet.getRow(1).values as unknown[]).filter(Boolean).map(String);
  expect(header.length).toBeGreaterThan(2);
  expect(header.join(" ")).not.toMatch(/undefined|NaN/);
});

test("theo dõi đăng ký: gửi nhắc sinh viên chưa đăng ký", async ({ page }) => {
  await page.goto("/administrator/registration-monitor");
  const table = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Nhắc" }) });
  // Lớp 48.01.TOAN có cả sinh viên đã có tài khoản (tài khoản e2e cấp thêm) lẫn chưa có: chọn mỗi loại một người.
  await fillFilter(page.getByLabel("Tìm sinh viên"), "48.01.101");
  const withAccount = table.getByRole("row").filter({ hasText: "Chưa nhắc" }).first();
  const withoutAccount = table.getByRole("row").filter({ hasText: "Chưa có tài khoản" }).first();
  const code = (await withAccount.innerText()).match(/\d{2}\.\d{2}\.\d{3}\.\d{3}/)![0];
  await selectRow(withAccount);
  await selectRow(withoutAccount);
  await page.getByRole("button", { name: "Gửi nhắc (2)" }).click();
  // Số thư gửi được tùy cấu hình thư của server (chế độ start dùng khóa Resend giả nên thư không gửi được).
  await expect(
    toast(page, /^Đã nhắc đăng ký: 1 sinh viên nhận thông báo trên cổng; \d sinh viên được gửi thư tới email trường; 1 sinh viên chưa có tài khoản cổng nên chỉ nhận thư/),
  ).toBeVisible();
  const reminded = table.getByRole("row").filter({ hasText: code });
  await expect(reminded).toContainText("Đã nhắc");

  await page.reload();
  await fillFilter(page.getByLabel("Tìm sinh viên"), code);
  await expect(reminded).toContainText("Đã nhắc");
});
