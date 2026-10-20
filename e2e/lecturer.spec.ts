import ExcelJS from "exceljs";
import { asRole, chooseOption, dialog, expect, openAs, test, toast, vietnamDate, waitForAction, waitForHydration } from "./support/fixtures";

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
    expect(download.suggestedFilename()).toBe("bang-diem-COMP1020.01.xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(await download.path());
    const sheet = book.worksheets[0];
    // Tìm hàng tiêu đề (có ô "MSSV") và cột "Cuối kỳ" thay vì cố định vị trí.
    let headerRow = 0;
    sheet.eachRow((row, number) => {
      if (!headerRow && row.values && (row.values as unknown[]).includes("MSSV")) headerRow = number;
    });
    expect(headerRow).toBeGreaterThan(0);
    const headers = Array.from(sheet.getRow(headerRow).values as unknown[], (value) => String(value ?? ""));
    const finalColumn = headers.findIndex((value) => value.startsWith("Cuối kỳ"));
    expect(finalColumn).toBeGreaterThan(0);
    // Sinh viên đầu tiên của danh sách (danh sách lớp seed theo điều kiện đăng ký nên không cố định một MSSV).
    const target = headerRow + 1;
    const studentName = String(sheet.getRow(target).getCell(2).value ?? "");
    expect(studentName.length).toBeGreaterThan(0);
    // Sửa điểm cuối kỳ của sinh viên đó trong tệp đã xuất rồi nhập lại.
    sheet.getRow(target).getCell(finalColumn).value = 8.5;
    const edited = Buffer.from(await book.xlsx.writeBuffer());

    // Tệp .xlsx được đọc bằng một server action; lưu nháp là lượt gọi sau đó (tự lưu sau khoảng 1 giây) mang điểm mới.
    const saved = page.waitForResponse((response) => Boolean(response.request().headers()["next-action"]) && (response.request().postData() ?? "").includes('"score":8.5'));
    await page.locator('input[type="file"][accept=".xlsx,.csv"]').setInputFiles({ name: "bang-diem-sua.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: edited });
    await expect(toast(page, /Đã điền \d+ điểm từ tệp bang-diem-sua\.xlsx/)).toBeVisible();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText(/Đã lưu nháp lúc/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("spinbutton", { name: `Cuối kỳ của ${studentName}` })).toHaveValue("8,50");
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
  const open = page.getByRole("button", { name: "Đặt lịch hẹn" });
  await waitForHydration(open);
  await open.click();
  const form = dialog(page, "Đặt lịch hẹn");
  await chooseOption(page, form.getByLabel("Sinh viên"), "Dương Khánh Châu", { search: "Dương Khánh Châu" });
  await form.getByLabel("Nội dung").fill(topic);
  await form.getByLabel("Ngày").fill(vietnamDate(9));
  await form.getByLabel("Ngày").press("Enter");
  await form.getByLabel("Giờ bắt đầu").fill("14:15");
  await form.getByLabel("Giờ bắt đầu").press("Enter");
  await expect(form.getByLabel("Ngày")).toHaveValue(vietnamDate(9));
  await expect(form.getByLabel("Giờ bắt đầu")).toHaveValue("14:15");
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
