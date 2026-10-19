"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Checkbox, Modal, Table, Upload, type TableColumnsType } from "antd";
import { CircleCheck, CircleWarning, Download, FileArrowIn } from "defeat-icons-react";
import { IMPORT_COLUMNS, templateCsv, validateImportRow, type ImportCatalog, type ImportResult, type ImportRow } from "@/modules/users/users.rule";
import type { StudentFormValues } from "@/modules/users/users.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeStudentCode } from "@/shared/libs/student-code.lib";
import { downloadFile, parseCsv } from "@/shared/libs/download.lib";
import { buildSpreadsheet, readSpreadsheet, XLSX_MIME } from "@/shared/libs/spreadsheet.lib";

type StudentImportModalProps = {
  open: boolean;
  existingCodes: string[];
  // Mã ngành và khóa hợp lệ, đọc từ DB.
  catalog: ImportCatalog;
  onClose: () => void;
  // Trả true khi server đã ghi xong, modal mới đóng.
  onImport: (values: StudentFormValues[], options: { provisionAccounts: boolean }) => Promise<boolean>;
};

// Bỏ dòng tiêu đề; số dòng tính theo tệp (dòng 1 là tiêu đề) để người dùng tìm lại trong Excel.
function importRows(rows: string[][]): ImportRow[] {
  return rows.slice(1).map((cells, index) => ({ line: index + 2, cells }));
}

const BIRTH_DATE_COLUMN = IMPORT_COLUMNS.indexOf("Ngày sinh");

// Ô ngày sinh lưu số ngày kiểu Excel (đếm từ 30/12/1899) khi ô bị định dạng chữ hoặc số: đổi về dd/mm/yyyy như tệp CSV.
function excelSerialDate(value: string) {
  if (!/^\d{5}$/.test(value)) return value;
  const date = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86_400_000);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

// .xlsx đọc bằng exceljs ngay trên trình duyệt (chỉ tải thư viện khi chọn tệp Excel); ô ngày của Excel đổi thành dd/mm/yyyy như tệp CSV.
async function readImportFile(file: File): Promise<string[][]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return parseCsv(await file.text());
  const rows = await readSpreadsheet(await file.arrayBuffer());
  return rows.map((cells, index) => (index === 0 ? cells : cells.map((cell, column) => (column === BIRTH_DATE_COLUMN ? excelSerialDate(cell) : cell))));
}

// Tệp mẫu Excel cùng cột với tệp CSV; cột mã, ngày, điện thoại định dạng chữ để Excel không bỏ số 0 ở đầu hay tự đổi ngày.
async function downloadTemplateXlsx() {
  const [header, ...rows] = parseCsv(templateCsv());
  const bytes = await buildSpreadsheet(
    "Sinh viên",
    header.map((title, index) => ({ header: title, text: [0, 3, 5, 6, 7].includes(index) })),
    rows,
  );
  downloadFile("mau-nhap-sinh-vien.xlsx", bytes, XLSX_MIME);
}


const COLUMNS: TableColumnsType<ImportResult> = [
  { title: "Dòng", dataIndex: "line", width: 64, render: (value: number) => <span className="tabular-nums">{value}</span> },
  { title: "Mã SV", key: "code", width: 120, render: (_, row) => <span className="text-xs">{row.raw[0]}</span> },
  { title: "Họ và tên", key: "name", width: 160, render: (_, row) => row.raw[1] || <span className="text-muted">Trống</span> },
  {
    title: "Kết quả",
    key: "result",
    render: (_, row) =>
      row.errors.length === 0 ? (
        <span className="flex items-center gap-1 text-green-700">
          <CircleCheck size={14} aria-hidden />
          Hợp lệ
        </span>
      ) : (
        <ul className="flex flex-col gap-0.5 text-xs text-rose-700">
          {row.errors.map((error) => (
            <li key={error} className="flex items-start gap-1">
              <CircleWarning size={12} aria-hidden className="mt-0.5 shrink-0" />
              {error}
            </li>
          ))}
        </ul>
      ),
  },
];

export function StudentImportModal({ open, existingCodes, catalog, onClose, onImport }: StudentImportModalProps) {
  const [isImporting, startImporting] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [provisionAccounts, setProvisionAccounts] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const valid = results.filter((result) => result.values !== null);
  const invalid = results.filter((result) => result.values === null);

  const reset = () => {
    setFileName(null);
    setResults([]);
    setProvisionAccounts(true);
    setReadError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const check = (rows: ImportRow[]) => {
    const existing = new Set(existingCodes.map(normalizeStudentCode));
    const seen = new Set<string>();
    setResults(rows.map((row) => validateImportRow(row, existing, seen, catalog)));
  };

  return (
    <Modal
      open={open}
      title="Nhập danh sách sinh viên"
      width={720}
      onCancel={close}
      mask={{ closable: false }}
      destroyOnHidden
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={close}>Hủy</Button>
          {invalid.length > 0 && (
            <Button
              icon={<Download size={16} aria-hidden className="text-zinc-500" />}
              onClick={() =>
                downloadFile(
                  "dong-loi-nhap-sinh-vien.csv",
                  [[...IMPORT_COLUMNS, "Lỗi"].join(","), ...invalid.map((row) => [...row.raw, row.errors.join("; ")].join(","))].join("\n"),
                )
              }
            >
              Tải các dòng lỗi
            </Button>
          )}
          <Button
            type="primary"
            loading={isImporting}
            disabled={valid.length === 0}
            onClick={() =>
              startImporting(async () => {
                if (await onImport(valid.map((result) => result.values!), { provisionAccounts })) close();
              })
            }
          >
            {valid.length > 0 ? `Nhập ${valid.length} dòng hợp lệ` : "Nhập dữ liệu"}
          </Button>
        </div>
      }
    >
      {results.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-pretty text-muted">
            Tệp gồm {IMPORT_COLUMNS.length} cột theo đúng thứ tự của file mẫu. Hệ thống kiểm tra từng dòng trước khi nhập; dòng lỗi được bỏ qua và
            tải về được để sửa.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Download size={16} aria-hidden className="text-zinc-500" />}
              onClick={() => void downloadTemplateXlsx().catch(() => setReadError("Chưa tạo được file mẫu Excel, tải bản .csv hoặc thử lại."))}
            >
              Tải file mẫu .xlsx
            </Button>
            <Button onClick={() => downloadFile("mau-nhap-sinh-vien.csv", templateCsv())}>Bản .csv</Button>
          </div>
          {readError && <Alert type="error" showIcon title={readError} />}
          <Upload.Dragger
            accept=".csv,.xlsx"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              setReadError(null);
              readImportFile(file)
                .then((rows) => {
                  if (rows.length < 2) {
                    setReadError(`${file.name} không có dòng dữ liệu nào dưới dòng tiêu đề.`);
                    return;
                  }
                  setFileName(file.name);
                  check(importRows(rows));
                })
                .catch(() => setReadError(`Không đọc được ${file.name}. Mở bằng Excel, lưu lại thành .xlsx hoặc CSV UTF-8 rồi chọn lại.`));
              return false;
            }}
          >
            <div className="flex flex-col items-center gap-2 py-4">
              <FileArrowIn size={28} aria-hidden className="text-muted" />
              <span className="font-medium">Kéo tệp .xlsx hoặc .csv vào đây, hoặc chọn tệp</span>
              <span className="text-xs text-muted">Tối đa 5 MB, 2.000 dòng</span>
            </div>
          </Upload.Dragger>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert
            type={invalid.length === 0 ? "success" : "warning"}
            showIcon
            title={`${fileName}: ${results.length} dòng, ${valid.length} hợp lệ, ${invalid.length} lỗi`}
            description={invalid.length > 0 ? "Dòng lỗi sẽ không được nhập. Sửa theo gợi ý rồi nhập lại riêng các dòng đó." : "Mọi dòng đều hợp lệ."}
            action={
              <Button size="small" onClick={reset}>
                Chọn tệp khác
              </Button>
            }
          />
          <Table
            rowKey="line"
            size="small"
            columns={COLUMNS}
            dataSource={results}
            pagination={{ itemRender: paginationItemRender, pageSize: 8, hideOnSinglePage: true }}
            scroll={{ x: 560 }}
          />
          <Checkbox checked={provisionAccounts} onChange={(event) => setProvisionAccounts(event.target.checked)}>
            Cấp tài khoản và gửi thư kích hoạt tới email trường của từng sinh viên
          </Checkbox>
        </div>
      )}
    </Modal>
  );
}
