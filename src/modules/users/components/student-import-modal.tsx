"use client";

import { useState } from "react";
import { Alert, Button, Modal, Table, Upload, type TableColumnsType } from "antd";
import { CircleCheck, CircleWarning, Download, FileArrowIn } from "defeat-icons-react";
import { IMPORT_COLUMNS, templateCsv, validateImportRow, type ImportResult, type ImportRow } from "../users.rule";
import type { StudentFormValues } from "../users.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";

type StudentImportModalProps = {
  open: boolean;
  existingCodes: string[];
  onClose: () => void;
  onImport: (values: StudentFormValues[]) => void;
};

const XLSX_SAMPLE: string[][] = [
  ["5101104201", "Nguyễn Văn An", "Nam", "15/03/2007", "", "0901234567", "104", "51", "51.01.CNTT.A"],
  ["5101101202", "Trần Thị Bình", "Nữ", "02/11/2007", "", "", "101", "51", "51.01.TOAN.B"],
  ["5101601203", "Lê Minh Châu", "Nữ", "2007-08-21", "", "", "601", "51", "51.01.VAN.A"],
  ["4901104008", "Dương Nhật Nam", "Nam", "28/07/2005", "", "", "104", "49", "49.01.CNTT.A"],
  ["5101751204", "Phạm Gia Huy", "Nam", "09/01/2007", "huy@", "", "751", "51", "51.01.ANH.A"],
  ["5101102205", "", "Nữ", "30/04/2007", "", "", "102", "51", "51.01.LY.B"],
  ["5101611206", "Võ Thanh Tâm", "Nữ", "12/12/2007", "", "0987654321", "611", "51", "51.01.TLH.A"],
  ["5101999207", "Hồ Quốc Khánh", "Nam", "05/06/2007", "", "", "999", "51", "51.01.CNTT.B"],
];

function parseCsv(text: string): ImportRow[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line, index) => ({ line: index + 2, cells: line.split(",") }))
    .filter((row) => row.cells.some((cell) => cell.trim()));
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
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

export function StudentImportModal({ open, existingCodes, onClose, onImport }: StudentImportModalProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const valid = results.filter((result) => result.values !== null);
  const invalid = results.filter((result) => result.values === null);

  const reset = () => {
    setFileName(null);
    setResults([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const check = (rows: ImportRow[]) => {
    const existing = new Set(existingCodes);
    const seen = new Set<string>();
    setResults(rows.map((row) => validateImportRow(row, existing, seen)));
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
                download(
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
            disabled={valid.length === 0}
            onClick={() => {
              onImport(valid.map((result) => result.values!));
              close();
            }}
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
          <Button icon={<Download size={16} aria-hidden className="text-zinc-500" />} onClick={() => download("mau-nhap-sinh-vien.csv", templateCsv())} className="w-fit">
            Tải file mẫu
          </Button>
          <Upload.Dragger
            accept=".csv,.xlsx"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              setFileName(file.name);
              if (file.name.toLowerCase().endsWith(".csv")) {
                file.text().then((text) => check(parseCsv(text)));
              } else {
                check(XLSX_SAMPLE.map((cells, index) => ({ line: index + 2, cells })));
              }
              return false;
            }}
          >
            <div className="flex flex-col items-center gap-2 py-4">
              <FileArrowIn size={28} aria-hidden className="text-muted" />
              <span className="font-medium">Kéo tệp .csv hoặc .xlsx vào đây, hoặc chọn tệp</span>
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
        </div>
      )}
    </Modal>
  );
}
