"use client";

import { useState, useTransition } from "react";
import { Alert, Button, message, Modal, Table, Upload, type TableColumnsType } from "antd";
import { Download, FileArrowIn } from "defeat-icons-react";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { formatDateTime } from "@/shared/libs/date.lib";
import { downloadFile } from "@/shared/libs/download.lib";
import { buildSpreadsheet, XLSX_MIME } from "@/shared/libs/spreadsheet.lib";
import { importStatement, previewStatement } from "@/modules/tuition/tuition.action";
import { formatMoney, STATEMENT_STATUS, transferContent } from "@/modules/tuition/tuition.constant";
import { RECORDABLE_STATEMENT_STATUSES } from "@/modules/tuition/tuition.rule";
import type { StatementPreview, StatementPreviewRow, StatementStatus } from "@/modules/tuition/tuition.type";

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";
const MAX_BYTES = 900 * 1024;

const SUMMARY_ORDER: StatementStatus[] = ["matched", "partial", "over", "duplicate", "unmatched", "invalid"];

async function downloadTemplate() {
  const bytes = await buildSpreadsheet(
    "Sao kê",
    [{ header: "Ngày giao dịch", width: 20 }, { header: "Mã giao dịch", text: true, width: 18 }, { header: "Số tiền ghi có", width: 16 }, { header: "Nội dung", width: 48 }],
    [
      ["19/10/2026 09:15", "FT26292000001", 9_063_600, `NGUYEN VAN A ${transferContent("5001104201", "hk1-2026")}`],
      ["19/10/2026 10:02", "FT26292000002", 4_000_000, transferContent("5001101202", "hk1-2026")],
    ],
  );
  downloadFile("mau-sao-ke-hoc-phi.xlsx", bytes, XLSX_MIME);
}

type StatementImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function StatementImportModal({ open, onClose, onImported }: StatementImportModalProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [isReading, startReading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const reset = () => {
    setPreview(null);
    setSelected([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const read = (file: File) =>
    startReading(async () => {
      if (file.size > MAX_BYTES) {
        messageApi.error("Tệp lớn hơn 900 KB. Tách sao kê theo ngày rồi nhập lần lượt.");
        return;
      }
      const data = new FormData();
      data.set("file", file);
      const result = await previewStatement(data).catch(() => null);
      if (!result) {
        messageApi.error(NETWORK_ERROR);
        return;
      }
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      setPreview(result.data);
      setSelected(result.data.rows.filter((row) => row.status === "matched").map((row) => row.line));
    });

  const chosen = preview?.rows.filter((row) => selected.includes(row.line)) ?? [];

  const save = () =>
    startSaving(async () => {
      if (!preview) return;
      const result = await importStatement({
        fileName: preview.fileName,
        lines: chosen.map((row) => ({ line: row.line, paidAt: row.paidAt!, reference: row.reference, amount: row.amount!, content: row.content })),
      }).catch(() => null);
      if (!result) {
        messageApi.error(NETWORK_ERROR);
        return;
      }
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(`Đã ghi ${result.data.recorded} khoản, ${formatMoney(result.data.total)} cho ${result.data.students} sinh viên. Sinh viên nhận thông báo trên cổng.`);
      reset();
      onImported();
    });

  const columns: TableColumnsType<StatementPreviewRow> = [
    { title: "Dòng", dataIndex: "line", width: 60, render: (value: number) => <span className="tabular-nums">{value}</span> },
    {
      title: "Giao dịch",
      key: "transaction",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium tabular-nums">{row.amount !== null ? formatMoney(row.amount) : ""}</span>
          <span className="text-xs text-muted tabular-nums">
            {row.reference}
            {row.paidAt && ` · ${formatDateTime(row.paidAt)}`}
          </span>
          <span className="text-xs text-pretty break-words text-muted">{row.content}</span>
        </span>
      ),
    },
    {
      title: "Hóa đơn",
      key: "invoice",
      width: 200,
      render: (_, row) =>
        row.studentName ? (
          <span className="flex min-w-0 flex-col text-xs">
            <span className="text-sm">{row.studentName}</span>
            <span className="text-muted tabular-nums">
              {row.studentCode} · {row.termName}
            </span>
            {row.balance !== null && <span className="text-muted tabular-nums">Còn nợ {formatMoney(row.balance)}</span>}
          </span>
        ) : null,
    },
    {
      title: "Kết quả",
      key: "status",
      width: 220,
      render: (_, row) => (
        <span className="flex flex-col items-start gap-1">
          <StatusTag status={STATEMENT_STATUS[row.status]} />
          <span className="text-xs text-pretty text-muted">{row.message}</span>
        </span>
      ),
    },
  ];

  const counts = preview ? SUMMARY_ORDER.map((status) => ({ status, count: preview.rows.filter((row) => row.status === status).length })).filter((entry) => entry.count > 0) : [];

  return (
    <Modal
      open={open}
      title="Nhập sao kê ngân hàng"
      width={900}
      onCancel={close}
      mask={{ closable: false }}
      destroyOnHidden
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={close}>Hủy</Button>
          <Button type="primary" loading={isSaving} disabled={chosen.length === 0} onClick={save}>
            {chosen.length > 0 ? `Ghi ${chosen.length} khoản, ${formatMoney(chosen.reduce((sum, row) => sum + (row.amount ?? 0), 0))}` : "Ghi nhận"}
          </Button>
        </div>
      }
    >
      {contextHolder}
      {!preview ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-pretty text-muted">
            Tệp sao kê tài khoản thu học phí, có các cột Ngày giao dịch, Mã giao dịch, Số tiền ghi có, Nội dung. Khoản có nội dung dạng {transferContent("5001104009", "hk1-2026")} được
            đối chiếu với hóa đơn; xem trước rồi mới ghi.
          </p>
          <Button icon={<Download size={16} aria-hidden className="text-zinc-500" />} className="w-fit" onClick={() => void downloadTemplate().catch(() => messageApi.error(NETWORK_ERROR))}>
            Tải tệp mẫu .xlsx
          </Button>
          <Upload.Dragger
            accept=".xlsx,.csv"
            maxCount={1}
            showUploadList={false}
            disabled={isReading}
            beforeUpload={(file) => {
              read(file);
              return false;
            }}
          >
            <div className="flex flex-col items-center gap-2 py-4">
              <FileArrowIn size={28} aria-hidden className="text-muted" />
              <span className="font-medium">{isReading ? "Đang đối chiếu..." : "Kéo tệp .xlsx hoặc .csv vào đây, hoặc chọn tệp"}</span>
              <span className="text-xs text-muted">Tối đa 900 KB, 2.000 dòng</span>
            </div>
          </Upload.Dragger>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert
            type={preview.rows.some((row) => !RECORDABLE_STATEMENT_STATUSES.includes(row.status)) ? "warning" : "success"}
            showIcon
            title={`${preview.fileName}: ${preview.rows.length} khoản ghi có${preview.skipped > 0 ? `, bỏ qua ${preview.skipped} dòng không phải tiền vào` : ""}`}
            description={
              <span className="flex flex-col gap-1">
                <span className="tabular-nums">{counts.map((entry) => `${STATEMENT_STATUS[entry.status].label} ${entry.count}`).join(" · ")}</span>
                <span>Dòng khớp đủ được chọn sẵn. Dòng nộp thiếu chỉ ghi khi bạn chọn; dòng lệch số tiền, trùng mã hoặc không khớp phải xử lý tay.</span>
              </span>
            }
            action={
              <Button size="small" onClick={reset}>
                Chọn tệp khác
              </Button>
            }
          />
          <Table
            rowKey="line"
            size="small"
            columns={columns}
            dataSource={preview.rows}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys.map(Number)),
              getCheckboxProps: (row) => ({ disabled: !RECORDABLE_STATEMENT_STATUSES.includes(row.status), "aria-label": `Chọn dòng ${row.line}` }),
            }}
            pagination={{ itemRender: paginationItemRender, pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 760 }}
          />
        </div>
      )}
    </Modal>
  );
}
