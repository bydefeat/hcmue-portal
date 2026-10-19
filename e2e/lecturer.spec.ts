import { readFile } from "node:fs/promises";
import { asRole, dialog, expect, openAs, test, toast, vietnamDate, waitForAction } from "./support/fixtures";

test.use(asRole("lecturer"));

// COMP1020.01 (đang nhập điểm) và COMP1020.02 do ThS. Phạm Thùy Hạnh dạy; sinh viên seed học COMP1020.02.
const CLASS_01 = "/lecturer/classes/01940000-0000-7cf6-8e9d-061ac04964c4";
const CLASS_02 = "/lecturer/classes/01940000-0000-71d7-86de-be61a4f0a489";


test.describe("nhập điểm", () => {
  test("lưu nháp tự động, tải lại vẫn còn", async ({ page }) => {
    await page.goto(`${CLASS_01}/grading`);
    const midterm = page.getByRole("spinbutton", { name: "Giữa kỳ của Ngô Phương Anh" });
    await expect(midterm).toHaveValue("");
    const saved = waitForAction(page);
    await midterm.fill("7,5");
    await midterm.press("Tab");
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText(/Đã lưu nháp lúc/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("spinbutton", { name: "Giữa kỳ của Ngô Phương Anh" })).toHaveValue("7,50");
  });

  test("xuất bảng điểm ra tệp rồi nhập lại từ tệp đã sửa", async ({ page }) => {
    await page.goto(`${CLASS_01}/grading`);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Xuất Excel" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("bang-diem-COMP1020.01.csv");
    const csv = await readFile(await download.path(), "utf8");
    const [header, ...rows] = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
    expect(header).toBe("MSSV,Họ và tên,Chuyên cần (10%),Giữa kỳ (30%),Cuối kỳ (60%),Tổng,Điểm chữ");
    expect(rows.find((row) => row.startsWith("49.01.104.101,Lý Tuấn Bảo,"))).toBeTruthy();

    // Tệp theo đúng mẫu đã xuất, chỉ giữ dòng của Lý Tuấn Bảo và sửa điểm cuối kỳ; ô trống thì giữ điểm đang có.
    const edited = Buffer.from(`${header}\n49.01.104.101,Lý Tuấn Bảo,,,"8,5"\n`, "utf8");

    const saved = waitForAction(page);
    await page.locator('input[type="file"][accept=".csv"]').setInputFiles({ name: "bang-diem-sua.csv", mimeType: "text/csv", buffer: edited });
    await expect(toast(page, /Đã điền \d+ điểm từ tệp bang-diem-sua\.csv/)).toBeVisible();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText(/Đã lưu nháp lúc/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("spinbutton", { name: "Cuối kỳ của Lý Tuấn Bảo" })).toHaveValue("8,50");
  });
});

test("điểm danh một buổi", async ({ page }) => {
  await page.goto(`${CLASS_01}/attendance`);
  await expect(page.getByText(/Buổi 7 · Thứ 2, 19\/10\/2026|Buổi \d+ ·/).first()).toBeVisible();
  await page.getByRole("button", { name: "Tất cả có mặt" }).click();
  await page.getByRole("radiogroup", { name: "Trạng thái của Lê Thu Châu" }).getByText("Vắng có phép").click();
  await page.getByRole("button", { name: "Lưu điểm danh" }).click();
  await expect(toast(page, /Đã lưu điểm danh/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Trạng thái của Lê Thu Châu" }).getByRole("radio", { name: "Vắng có phép" })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: "Trạng thái của Ngô Phương Anh" }).getByRole("radio", { name: "Có mặt" })).toBeChecked();
});

test("đăng thông báo lớp, sinh viên của lớp thấy ngay", async ({ page, browser }) => {
  const title = `Đổi phòng học tuần sau (e2e ${Date.now()})`;
  await page.goto(`${CLASS_02}/announcements`);
  await page.getByRole("button", { name: "Soạn thông báo" }).click();
  const compose = dialog(page, "Thông báo cho lớp COMP1020.02");
  await compose.getByLabel("Tiêu đề").fill(title);
  await compose.getByLabel("Nội dung").fill("Buổi học thứ 4 tuần sau chuyển sang phòng B.408.");
  await compose.getByRole("button", { name: "Đăng ngay" }).click();
  await expect(toast(page, "Đã đăng thông báo cho lớp COMP1020.02")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const student = await openAs(browser, "student");
  await student.goto("/application/classes/01940000-0000-71d7-86de-be61a4f0a489");
  await expect(student.getByRole("heading", { name: title })).toBeVisible();
  await student.context().close();
});

test("đặt lịch hẹn cố vấn", async ({ page }) => {
  const topic = `Tư vấn chọn chuyên ngành (e2e ${Date.now()})`;
  await page.goto("/lecturer/advising/appointments");
  await page.getByRole("button", { name: "Đặt lịch hẹn" }).click();
  const form = dialog(page, "Đặt lịch hẹn");
  const students = form.getByLabel("Sinh viên");
  await students.fill("Dương Khánh Châu");
  await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option").filter({ hasText: "Dương Khánh Châu" }).click();
  await form.getByLabel("Nội dung").fill(topic);
  await form.getByLabel("Ngày").fill(vietnamDate(9));
  await form.getByLabel("Ngày").press("Enter");
  await form.getByLabel("Giờ bắt đầu").fill("14:15");
  await form.getByLabel("Giờ bắt đầu").press("Enter");
  await form.getByLabel("Địa điểm hoặc đường dẫn").fill("Văn phòng khoa, phòng B.201");
  await form.getByRole("button", { name: "Gửi lời mời" }).click();
  await expect(toast(page, /Đã hẹn 1 sinh viên lúc 14:15/)).toBeVisible();

  await page.reload();
  const item = page.getByRole("listitem").filter({ hasText: topic });
  await expect(item).toContainText("14:15");
  await expect(item.getByRole("link", { name: "Dương Khánh Châu" })).toBeVisible();
});

test("duyệt đơn ở bước của mình", async ({ page }) => {
  await page.goto("/lecturer/requests");
  // Đơn học vượt của Võ Thành Huy đang chờ cố vấn (giảng viên seed) xác nhận.
  await page.getByRole("button", { name: "DT-2026-01249" }).click();
  const detail = dialog(page, "Học vượt tín chỉ · DT-2026-01249");
  await detail.getByLabel("Ý kiến xử lý").fill("Đồng ý, sinh viên có kết quả học tập tốt.");
  await detail.getByRole("button", { name: "Đồng ý", exact: true }).click();
  await expect(toast(page, /DT-2026-01249/)).toBeVisible();

  await page.reload();
  // Bước cố vấn đã xong: đơn rời danh sách "Cần tôi xử lý", vẫn xem được ở "Tất cả" với bước kế tiếp.
  await expect(page.getByRole("button", { name: "DT-2026-01249" })).toHaveCount(0);
  await page.getByText("Tất cả", { exact: true }).click();
  await expect(page.getByRole("row", { name: /^DT-2026-01249 / })).toContainText("Khoa đồng ý");
});

test("chọn lớp khác trong danh sách lớp", async ({ page }) => {
  await page.goto("/lecturer/classes");
  await page.getByRole("link", { name: /Trí tuệ nhân tạo COMP1080\.01/ }).click();
  await expect(page.getByRole("heading", { name: "Trí tuệ nhân tạo COMP1080.01", level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "Đề cương" }).click();
  await expect(page).toHaveURL(/\/syllabus$/);
});
