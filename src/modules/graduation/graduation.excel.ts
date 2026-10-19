import "server-only";
import ExcelJS from "exceljs";
import { GRADUATION_STATUS } from "@/modules/graduation/graduation.constant";
import type { GraduationCandidate } from "@/modules/graduation/graduation.type";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Danh sách đang lọc, mỗi điều kiện một cột "Đạt"/"Chưa đạt" kèm chi tiết, để khoa đối chiếu trước khi trình hội đồng.
export async function graduationWorkbook(rows: GraduationCandidate[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HCMUE Portal";
  const sheet = workbook.addWorksheet("Xét tốt nghiệp", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  const checks = rows[0]?.checks ?? [];
  sheet.columns = [
    { header: "MSSV", width: 16 },
    { header: "Họ và tên", width: 28 },
    { header: "Lớp", width: 16 },
    { header: "Khoa", width: 28 },
    { header: "Ngành", width: 26 },
    { header: "Tín chỉ tích lũy", width: 14 },
    { header: "Tín chỉ yêu cầu", width: 14 },
    { header: "Điểm TBTL hệ 4", width: 14 },
    { header: "Xếp loại", width: 14 },
    { header: "Trạng thái", width: 22 },
    ...checks.map((check) => ({ header: check.label, width: 30 })),
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 32;
  for (const row of rows) {
    sheet.addRow([
      row.code,
      row.fullName,
      row.className,
      row.faculty,
      row.majorName,
      row.earnedCredits,
      row.requiredCredits,
      row.cpa4,
      row.classification,
      GRADUATION_STATUS[row.status].label,
      ...row.checks.map((check) => `${check.passed ? "Đạt" : "Chưa đạt"}: ${check.detail}`),
    ]);
  }
  sheet.getColumn(8).numFmt = "0.00";
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
