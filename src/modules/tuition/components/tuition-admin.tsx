"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { BankStatement, Magnifier, Plus, Receipt } from "defeat-icons-react";
import type { Dayjs } from "dayjs";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { loadInvoiceDetail, recordPayment, voidPayment } from "@/modules/tuition/tuition.action";
import { formatMoney, INVOICE_STATUS, PAYMENT_SOURCE_LABEL } from "@/modules/tuition/tuition.constant";
import { PAYMENT_METHODS } from "@/modules/tuition/tuition.rule";
import { StatementImportModal } from "@/modules/tuition/components/statement-import-modal";
import type { AdminInvoiceDetail, AdminInvoiceRow, InvoiceStatus, PaymentRecord } from "@/modules/tuition/tuition.type";

type StatusFilter = InvoiceStatus | "owing";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "owing", label: "Còn nợ" },
  { value: "overdue", label: INVOICE_STATUS.overdue.label },
  { value: "unpaid", label: INVOICE_STATUS.unpaid.label },
  { value: "partial", label: INVOICE_STATUS.partial.label },
  { value: "paid", label: INVOICE_STATUS.paid.label },
];

type PaymentFormValues = { amount: number; paidAt: Dayjs; method: string; reference: string; note?: string };

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

type TuitionAdminProps = {
  invoices: AdminInvoiceRow[];
  terms: { id: string; name: string }[];
  termId: string;
  initialQuery?: string;
  studentHrefBase: string | null;
};

function toRow({ lines: _lines, payments: _payments, discount: _discount, ...row }: AdminInvoiceDetail): AdminInvoiceRow {
  return row;
}

function PaymentHistory({ payments, onVoid }: { payments: PaymentRecord[]; onVoid: (payment: PaymentRecord) => void }) {
  if (payments.length === 0) return <p className="text-sm text-muted">Chưa có khoản nộp nào.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border-strong">
      {payments.map((payment) => (
        <li key={payment.id} className="flex flex-col gap-1 py-2 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className={`min-w-0 font-medium tabular-nums ${payment.voidedAt ? "text-muted line-through" : ""}`}>{formatMoney(payment.amount)}</span>
            {payment.voidedAt ? (
              <StatusTag status={{ label: "Đã hủy", tone: "neutral" }} />
            ) : (
              <Button size="small" type="text" danger onClick={() => onVoid(payment)}>
                Hủy khoản này
              </Button>
            )}
          </div>
          <span className="text-xs text-pretty text-muted tabular-nums">
            {formatDateTime(payment.paidAt)} · {payment.method} · mã {payment.reference}
          </span>
          <span className="text-xs text-pretty text-muted">
            {PAYMENT_SOURCE_LABEL[payment.source]}, {payment.recordedBy}
            {payment.source !== "bank-sync" && `, ${formatDateTime(payment.createdAt)}`}
          </span>
          {payment.note && <span className="text-xs text-pretty text-muted">{payment.note}</span>}
          {payment.voidedAt && (
            <span className="text-xs text-pretty text-rose-700">
              Hủy lúc {formatDateTime(payment.voidedAt)} bởi {payment.voidedBy}. Lý do: {payment.voidReason}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TuitionAdmin({ invoices, terms, termId, initialQuery, studentHrefBase }: TuitionAdminProps) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  // Hóa đơn vừa ghi hoặc hủy trong phiên này; sau khi nhập sao kê thì tải lại cả danh sách từ server.
  const [updated, setUpdated] = useState<Record<string, AdminInvoiceRow>>({});
  const rows = invoices.map((row) => updated[row.id] ?? row);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [status, setStatus] = useState<StatusFilter>();
  const [detail, setDetail] = useState<AdminInvoiceDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiding, setVoiding] = useState<PaymentRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [form] = Form.useForm<PaymentFormValues>();
  const [isSaving, startSaving] = useTransition();

  const needle = normalizeSearch(query.trim());
  const visible = rows.filter(
    (row) =>
      (!needle || normalizeSearch(`${row.studentCode} ${row.studentName} ${row.className}`).includes(needle)) &&
      (!status || (status === "owing" ? row.balance > 0 : row.status === status)),
  );
  const owing = rows.filter((row) => row.balance > 0);
  const overdue = rows.filter((row) => row.status === "overdue").length;

  const applyDetail = (next: AdminInvoiceDetail) => {
    setDetail(next);
    setUpdated((current) => ({ ...current, [next.id]: toRow(next) }));
  };

  const open = async (row: AdminInvoiceRow) => {
    setLoadingId(row.id);
    const result = await loadInvoiceDetail(row.id).catch(() => null);
    setLoadingId(null);
    if (!result?.ok) {
      messageApi.error(result?.message ?? NETWORK_ERROR);
      return;
    }
    setIsRecording(false);
    setDetail(result.data);
  };

  const record = (values: PaymentFormValues) =>
    startSaving(async () => {
      if (!detail) return;
      const result = await recordPayment({
        invoiceId: detail.id,
        amount: values.amount,
        paidAt: values.paidAt.second(0).toISOString(),
        method: values.method,
        reference: values.reference,
        note: values.note ?? "",
      }).catch(() => null);
      if (!result) {
        messageApi.error(NETWORK_ERROR);
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      applyDetail(result.data);
      setIsRecording(false);
      form.resetFields();
      messageApi.success(
        result.data.balance === 0
          ? `Đã ghi ${formatMoney(values.amount)}. ${result.data.studentName} đã nộp đủ, sinh viên nhận thông báo trên cổng.`
          : `Đã ghi ${formatMoney(values.amount)}, còn nợ ${formatMoney(result.data.balance)}. Sinh viên nhận thông báo trên cổng.`,
      );
    });

  const cancelPayment = () =>
    startSaving(async () => {
      if (!voiding) return;
      const result = await voidPayment({ paymentId: voiding.id, reason: voidReason }).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      applyDetail(result.data);
      messageApi.success(`Đã hủy khoản ${formatMoney(voiding.amount)}, còn nợ ${formatMoney(result.data.balance)}.`);
      setVoiding(null);
      setVoidReason("");
    });

  const columns: TableColumnsType<AdminInvoiceRow> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          {studentHrefBase ? (
            <Link href={`${studentHrefBase}${row.studentCode}`} className="truncate font-medium">
              {row.studentName}
            </Link>
          ) : (
            <span className="truncate font-medium">{row.studentName}</span>
          )}
          <span className="text-xs text-muted tabular-nums">
            {row.studentCode} · {row.className}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums md:hidden">
            {row.status === "paid" ? <span className="text-muted">{INVOICE_STATUS.paid.label}</span> : <StatusTag status={INVOICE_STATUS[row.status]} />}
            {row.balance > 0 && `Còn nợ ${formatMoney(row.balance)}`}
          </span>
        </span>
      ),
    },
    ...(termId === "all" ? [{ title: "Học kỳ", dataIndex: "termName", width: 200, responsive: ["lg" as const] }] : []),
    { title: <span className="whitespace-nowrap">Phải nộp</span>, dataIndex: "total", width: 130, align: "right", responsive: ["md"], render: (value: number) => <span className="tabular-nums">{formatMoney(value)}</span> },
    { title: <span className="whitespace-nowrap">Đã nộp</span>, dataIndex: "paid", width: 130, align: "right", responsive: ["md"], render: (value: number) => <span className="tabular-nums">{formatMoney(value)}</span> },
    {
      title: <span className="whitespace-nowrap">Còn nợ</span>,
      dataIndex: "balance",
      width: 130,
      align: "right",
      responsive: ["md"],
      sorter: (a, b) => a.balance - b.balance,
      render: (value: number) => <span className="font-medium tabular-nums">{value > 0 ? formatMoney(value) : ""}</span>,
    },
    { title: <span className="whitespace-nowrap">Hạn nộp</span>, dataIndex: "dueDate", width: 110, responsive: ["md"], render: (value: string) => <span className="tabular-nums">{formatDate(value)}</span> },
    { title: "Trạng thái", dataIndex: "status", width: 120, responsive: ["md"], render: (value: InvoiceStatus) => (value === "paid" ? <span className="text-xs text-muted">{INVOICE_STATUS.paid.label}</span> : <StatusTag status={INVOICE_STATUS[value]} />) },
    {
      title: "",
      key: "actions",
      width: 100,
      fixed: "right",
      align: "right",
      render: (_, row) => (
        <Button size="small" type="text" icon={<Receipt size={14} aria-hidden className="text-zinc-500" />} loading={loadingId === row.id} onClick={() => void open(row)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <PageHeader
        title="Học phí"
        description="Ghi nhận khoản nộp tiền mặt, chuyển khoản sai nội dung, nhập sao kê ngân hàng để gạch nợ hàng loạt. Sinh viên nhận thông báo và thấy hóa đơn cập nhật ngay."
        actions={
          <Button type="primary" icon={<BankStatement size={16} aria-hidden />} onClick={() => setIsImporting(true)}>
            Nhập sao kê
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <Select
            value={termId}
            onChange={(value: string) => router.push(`/administrator/tuition?term=${value}`)}
            aria-label="Học kỳ"
            options={[...terms.map((entry) => ({ value: entry.id, label: entry.name })), { value: "all", label: "Mọi học kỳ" }]}
            className="col-span-2 w-full sm:w-72"
          />
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="MSSV, họ tên hoặc lớp"
            aria-label="Tìm sinh viên"
            className="col-span-2 w-full sm:w-72"
          />
          <Select allowClear value={status} onChange={setStatus} placeholder="Mọi trạng thái" aria-label="Trạng thái" options={STATUS_OPTIONS} className="col-span-2 w-full sm:w-44" />
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular-nums">
          <span>{rows.length} hóa đơn</span>
          <span>Đã thu {formatMoney(rows.reduce((sum, row) => sum + row.paid, 0))}</span>
          {owing.length > 0 && (
            <span>
              {owing.length} hóa đơn còn nợ {formatMoney(owing.reduce((sum, row) => sum + row.balance, 0))}
            </span>
          )}
          {overdue > 0 && <span className="text-rose-700">{overdue} quá hạn, đang bị khóa đăng ký</span>}
        </p>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={visible}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} hóa đơn` }}
          locale={{
            emptyText: (
              <EmptyState
                illustration="search"
                title={rows.length === 0 ? "Học kỳ này chưa phát hành hóa đơn" : "Không có hóa đơn khớp bộ lọc"}
                description={rows.length === 0 ? undefined : "Thử bỏ bớt điều kiện lọc hoặc chọn Mọi học kỳ."}
              />
            ),
          }}
        />
      </div>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        size={520}
        destroyOnHidden
        mask={{ closable: !isRecording }}
        title={detail ? `${detail.studentName}, ${detail.termName}` : ""}
        footer={
          isRecording ? (
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsRecording(false)}>Hủy</Button>
              <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
                Ghi nhận
              </Button>
            </div>
          ) : null
        }
      >
        {detail && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted tabular-nums">
                  {detail.studentCode} · {detail.className} · Hạn nộp {formatDate(detail.dueDate)}
                </span>
                <span className="text-xl font-semibold tabular-nums">{detail.balance > 0 ? formatMoney(detail.balance) : "Đã nộp đủ"}</span>
                {detail.balance > 0 && <span className="text-xs text-muted">Còn phải nộp</span>}
              </div>
              <StatusTag status={INVOICE_STATUS[detail.status]} />
            </div>
            <ul className="flex flex-col divide-y divide-border-strong">
              {detail.lines.map((line) => (
                <li key={line.label} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 text-pretty">{line.label}</span>
                  <span className="shrink-0 tabular-nums">{formatMoney(line.amount)}</span>
                </li>
              ))}
              {detail.discount > 0 && (
                <li className="flex justify-between gap-3 py-2 text-sm">
                  <span>Miễn giảm</span>
                  <span className="tabular-nums">-{formatMoney(detail.discount)}</span>
                </li>
              )}
              <li className="flex justify-between gap-3 py-2 text-sm font-semibold">
                <span>Tổng phải nộp</span>
                <span className="tabular-nums">{formatMoney(detail.total)}</span>
              </li>
            </ul>
            {isRecording ? (
              <Form form={form} layout="vertical" onFinish={record} requiredMark>
                <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: "Chưa nhập số tiền" }]} extra={`Tối đa ${formatMoney(detail.balance)} (số còn nợ).`}>
                  <InputNumber<number>
                    min={1000}
                    max={detail.balance}
                    step={1000}
                    className="w-full tabular-nums"
                    suffix="đ"
                    formatter={(value) => (value === undefined ? "" : Number(value).toLocaleString("vi-VN"))}
                    parser={(value) => Number((value ?? "").replace(/\D/g, ""))}
                  />
                </Form.Item>
                <Form.Item name="paidAt" label="Thời điểm nộp" rules={[{ required: true, message: "Chưa chọn thời điểm nộp" }]} extra="Theo biên lai hoặc giờ giao dịch ngân hàng.">
                  <DatePicker showTime={{ format: "HH:mm" }} format="DD/MM/YYYY HH:mm" className="w-full" disabledDate={(date) => date.isAfter(dayjs(), "day")} />
                </Form.Item>
                <Form.Item name="method" label="Hình thức" rules={[{ required: true, message: "Chưa chọn hình thức" }]}>
                  <Select options={PAYMENT_METHODS.map((value) => ({ value, label: value }))} />
                </Form.Item>
                <Form.Item name="reference" label="Mã tham chiếu" rules={[{ required: true, whitespace: true, message: "Nhập mã giao dịch hoặc số biên lai" }]} extra="Mã giao dịch ngân hàng hoặc số biên lai; mỗi mã chỉ ghi được một lần.">
                  <Input maxLength={64} />
                </Form.Item>
                <Form.Item name="note" label="Ghi chú">
                  <Input.TextArea autoSize={{ minRows: 2 }} maxLength={300} showCount />
                </Form.Item>
              </Form>
            ) : (
              detail.balance > 0 && (
                <Button
                  icon={<Plus size={16} aria-hidden className="text-zinc-500" />}
                  className="w-fit"
                  onClick={() => {
                    form.resetFields();
                    setIsRecording(true);
                  }}
                >
                  Ghi thanh toán
                </Button>
              )
            )}
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Lịch sử thanh toán</h3>
              <PaymentHistory payments={detail.payments} onVoid={setVoiding} />
            </section>
          </div>
        )}
      </Drawer>

      <Modal
        open={voiding !== null}
        title={voiding ? `Hủy khoản ${formatMoney(voiding.amount)}, mã ${voiding.reference}` : ""}
        onCancel={() => {
          setVoiding(null);
          setVoidReason("");
        }}
        mask={{ closable: false }}
        okText="Hủy khoản này"
        cancelText="Giữ lại"
        okButtonProps={{ danger: true, loading: isSaving, disabled: voidReason.trim().length < 5 }}
        onOk={cancelPayment}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <Alert
            type="warning"
            showIcon
            title="Khoản này không còn tính vào số đã nộp"
            description="Dòng vẫn được giữ trong lịch sử kèm lý do. Mã giao dịch ghi lại được cho đúng hóa đơn. Hóa đơn quá hạn còn nợ sẽ khóa đăng ký trở lại."
          />
          <Form layout="vertical">
            <Form.Item label="Lý do hủy" required extra="Sinh viên thấy lý do này trong thông báo.">
              <Input.TextArea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} autoSize={{ minRows: 2 }} maxLength={300} showCount />
            </Form.Item>
          </Form>
        </div>
      </Modal>

      <StatementImportModal
        open={isImporting}
        onClose={() => setIsImporting(false)}
        onImported={() => {
          setIsImporting(false);
          setUpdated({});
          router.refresh();
        }}
      />
    </>
  );
}
