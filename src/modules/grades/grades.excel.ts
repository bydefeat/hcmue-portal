import "server-only";
import ExcelJS from "exceljs";
import { letterOf, roundingFormula, weightedScore } from "@/modules/grades/grades.rule";
import type { GradeComponent, GradingRules, ScoreRow } from "@/modules/grades/grades.type";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type WorkbookInput = {
  classCode: string;
  courseName: string;
  components: GradeComponent[];
  students: { studentId: string; studentCode: string; fullName: string }[];
  scores: Record<string, ScoreRow>;
  // Bảng điểm đã chốt thì khóa cả cột điểm.
  locked: boolean;
  // Thang điểm chữ và bước làm tròn của quy chế đang áp dụng, để công thức trong tệp ra đúng điểm như trên cổng.
  grading: GradingRules;
};

function columnLetter(index: number) {
  let value = index;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

// Điểm chữ trong Excel tính lại theo đúng thang điểm của quy chế khi giảng viên sửa điểm trong tệp.
function letterFormula(cell: string, scale: GradingRules["scale"]) {
  const steps = scale.slice(0, -1);
  const nested = steps.reduceRight((inner, step) => `IF(${cell}>=${step.min},"${step.letter}",${inner})`, `"${scale.at(-1)!.letter}"`);
  return `IF(${cell}="","",${nested})`;
}

// Tệp .xlsx theo mẫu nhập lại được: dòng 1 tiêu đề, cột A MSSV, cột B họ tên, mỗi cột điểm một cột theo thứ tự bảng điểm,
// rồi tổng và điểm chữ (công thức, tự tính lại khi sửa). Chỉ ô điểm mở khóa; trang tính bật bảo vệ không mật khẩu để tránh sửa nhầm.
export async function gradeSheetWorkbook(input: WorkbookInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HCMUE Portal";
  const sheet = workbook.addWorksheet(input.classCode.slice(0, 31), { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  const scoreStart = 3;
  const totalColumn = scoreStart + input.components.length;
  sheet.columns = [
    { header: "MSSV", width: 16 },
    { header: "Họ và tên", width: 28 },
    ...input.components.map((component) => ({ header: `${component.label} (${component.weight}%)`, width: Math.max(12, component.label.length + 8) })),
    { header: "Tổng", width: 10 },
    { header: "Điểm chữ", width: 10 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 32;

  input.students.forEach((student, index) => {
    const rowNumber = index + 2;
    const row = input.scores[student.studentId] ?? {};
    const total = weightedScore(input.components, row, input.grading.roundingStep);
    const scoreCells = input.components.map((_, column) => `${columnLetter(scoreStart + column)}${rowNumber}`);
    const weighted = input.components.map((component, column) => `${scoreCells[column]}*${component.weight}`).join("+");
    const totalCell = `${columnLetter(totalColumn)}${rowNumber}`;
    sheet.addRow([
      student.studentCode,
      student.fullName,
      ...input.components.map((component) => row[component.key] ?? null),
      { formula: `IF(COUNT(${scoreCells[0]}:${scoreCells.at(-1)})<${input.components.length},"",${roundingFormula(`(${weighted})`, input.grading.roundingStep)})`, result: total ?? "" },
      { formula: letterFormula(totalCell, input.grading.scale), result: total === null ? "" : letterOf(total, input.grading.scale).letter },
    ]);
  });

  for (let column = scoreStart; column <= totalColumn; column += 1) {
    sheet.getColumn(column).numFmt = column === totalColumn ? "0.0" : "0.00";
    sheet.getColumn(column).alignment = { horizontal: "right" };
  }
  if (!input.locked) {
    for (let rowNumber = 2; rowNumber <= input.students.length + 1; rowNumber += 1) {
      for (let column = scoreStart; column < totalColumn; column += 1) {
        const cell = sheet.getCell(rowNumber, column);
        cell.protection = { locked: false };
        cell.dataValidation = {
          type: "decimal",
          operator: "between",
          allowBlank: true,
          formulae: [0, 10],
          showErrorMessage: true,
          errorTitle: "Điểm không hợp lệ",
          error: "Điểm từ 0 đến 10.",
        };
      }
    }
  }
  await sheet.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, autoFilter: true, sort: false });

  const info = workbook.addWorksheet("Thông tin");
  info.addRows([["Lớp học phần", input.classCode], ["Học phần", input.courseName], ["Cách nhập lại", "Sửa ô điểm ở trang đầu, giữ nguyên dòng tiêu đề và cột MSSV, rồi chọn Nhập từ Excel trên cổng."]]);
  info.getColumn(1).width = 16;
  info.getColumn(2).width = 80;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return value.toISOString();
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("result" in value) return value.result === undefined ? "" : cellText(value.result as ExcelJS.CellValue);
  if ("error" in value) return "";
  return "";
}

// Đọc trang đầu của tệp .xlsx thành ma trận chữ (dòng i là dòng i+1 trong Excel, giữ dòng trống để báo đúng số dòng).
export async function readWorkbookMatrix(data: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const matrix: string[][] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: string[] = [];
    for (let column = 1; column <= Math.max(row.cellCount, 1); column += 1) cells.push(cellText(row.getCell(column).value).trim());
    matrix.push(cells);
  }
  return matrix;
}
