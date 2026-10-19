"use client";

import { Alert, Button, Collapse, Descriptions, message } from "antd";
import { Copy, Receipt } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { BANK_ACCOUNT, formatMoney, INVOICE_STATUS, transferContent } from "../tuition.constant";
import type { TuitionInvoiceView } from "../tuition.type";

function dueText(invoice: TuitionInvoiceView) {
  if (invoice.status === "paid") return null;
  if (invoice.daysToDue < 0) return { text: `Quá hạn ${-invoice.daysToDue} ngày`, className: "text-rose-700" };
  if (invoice.daysToDue === 0) return { text: "Hết hạn hôm nay", className: "text-amber-700" };
  return { text: `Còn ${invoice.daysToDue} ngày`, className: invoice.daysToDue <= 10 ? "text-amber-700" : "text-muted" };
}

function InvoiceBody({ invoice }: { invoice: TuitionInvoiceView }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border-strong">
        {invoice.lines.map((line) => (
          <li key={line.label} className="flex items-start justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 text-pretty">
              {line.label}
              {line.quantity > 1 && <span className="block text-xs text-muted tabular-nums">{line.quantity} × {formatMoney(line.unitPrice)}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(line.amount)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 py-2 text-sm font-semibold">
          <span>Tổng phải nộp</span>
          <span className="tabular-nums">{formatMoney(invoice.total)}</span>
        </li>
      </ul>
      {invoice.payments.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Lịch sử thanh toán</span>
          {invoice.payments.map((payment) => (
            <span key={payment.id} className="flex flex-wrap justify-between gap-x-3 text-xs text-muted tabular-nums">
              <span>
                {formatDateTime(payment.paidAt)} · {payment.method} · {payment.reference}
              </span>
              <span className="text-foreground">{formatMoney(payment.amount)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvoiceList({ invoices, studentCode }: { invoices: TuitionInvoiceView[]; studentCode: string }) {
  const [messageApi, contextHolder] = message.useMessage();
  const outstanding = invoices.filter((invoice) => invoice.balance > 0);
  const history = invoices.filter((invoice) => invoice.balance === 0);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      messageApi.success(`Đã sao chép ${label}`);
    } catch {
      messageApi.error(`Trình duyệt chặn sao chép. Chọn và sao chép ${label} thủ công.`);
    }
  };

  if (invoices.length === 0) {
    return (
      <SectionCard flush>
        <EmptyState icon={Receipt} title="Chưa có khoản phải nộp" description="Học phí được tính sau khi kết thúc đợt điều chỉnh đăng ký." />
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      {outstanding.length === 0 && <Alert type="success" showIcon title="Bạn đã nộp đủ học phí các học kỳ" />}
      {outstanding.map((invoice) => {
        const due = dueText(invoice);
        const content = transferContent(studentCode, invoice.termId);
        return (
          <SectionCard key={invoice.id}>
            <div className="flex flex-col gap-4">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">{invoice.termName}</h2>
                  <span className="text-xs text-muted tabular-nums">
                    Phát hành {formatDate(invoice.issuedAt)} · Hạn nộp {formatDateTime(invoice.dueDate)}
                  </span>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <span className="text-xl font-semibold tabular-nums">{formatMoney(invoice.balance)}</span>
                  <span className="flex items-center gap-2">
                    <StatusTag status={INVOICE_STATUS[invoice.status]} />
                    {due && <span className={`text-xs tabular-nums ${due.className}`}>{due.text}</span>}
                  </span>
                </div>
              </header>
              {invoice.status === "overdue" && (
                <Alert type="error" showIcon title="Tài khoản đang bị khóa đăng ký học phần" description="Nộp đủ học phí, hệ thống mở khóa sau 1 ngày làm việc kể từ khi nhận tiền." />
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <InvoiceBody invoice={invoice} />
                <div className="flex flex-col gap-2 rounded-lg bg-background p-3">
                  <span className="text-sm font-medium">Chuyển khoản</span>
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      { key: "bank", label: "Ngân hàng", children: <span className="text-pretty">{BANK_ACCOUNT.bank}</span> },
                      { key: "name", label: "Chủ tài khoản", children: BANK_ACCOUNT.accountName },
                      {
                        key: "number",
                        label: "Số tài khoản",
                        children: (
                          <span className="flex items-center gap-1">
                            {BANK_ACCOUNT.accountNumber}
                            <Button
                              type="text"
                              size="small"
                              aria-label="Sao chép số tài khoản"
                              icon={<Copy size={14} aria-hidden />}
                              onClick={() => copy(BANK_ACCOUNT.accountNumber.replace(/\s/g, ""), "số tài khoản")}
                            />
                          </span>
                        ),
                      },
                      {
                        key: "content",
                        label: "Nội dung",
                        children: (
                          <span className="flex items-center gap-1">
                            {content}
                            <Button
                              type="text"
                              size="small"
                              aria-label="Sao chép nội dung chuyển khoản"
                              icon={<Copy size={14} aria-hidden />}
                              onClick={() => copy(content, "nội dung chuyển khoản")}
                            />
                          </span>
                        ),
                      },
                    ]}
                  />
                  <p className="text-xs text-pretty text-muted">Ghi đúng nội dung để hệ thống tự gạch nợ. Sai nội dung, mang biên lai đến Phòng Kế hoạch - Tài chính.</p>
                </div>
              </div>
            </div>
          </SectionCard>
        );
      })}
      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Các học kỳ đã nộp</h2>
          <Collapse
            items={history.map((invoice) => ({
              key: invoice.id,
              label: (
                <span className="flex flex-wrap items-center justify-between gap-2">
                  {invoice.termName}
                  <span className="text-sm tabular-nums">{formatMoney(invoice.total)}</span>
                </span>
              ),
              children: <InvoiceBody invoice={invoice} />,
            }))}
          />
        </section>
      )}
    </div>
  );
}
