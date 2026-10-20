"use client";

import { Alert, Button, Collapse, Descriptions, message } from "antd";
import { Copy } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { BANK_ACCOUNT, formatMoney, INVOICE_STATUS, PROVISIONAL_INVOICE, transferContent } from "@/modules/tuition/tuition.constant";
import type { TuitionInvoiceView } from "@/modules/tuition/tuition.type";

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
        {invoice.discount > 0 && (
          <li className="flex items-start justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 text-pretty">
              Miễn giảm
              {invoice.discountReason && <span className="block text-xs text-muted">{invoice.discountReason}</span>}
            </span>
            <span className="shrink-0 tabular-nums">-{formatMoney(invoice.discount)}</span>
          </li>
        )}
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
      {invoice.refunded > 0 && <span className="text-xs text-muted tabular-nums">Đã hoàn {formatMoney(invoice.refunded)}</span>}
      {invoice.refundDue > 0 && (
        <Alert
          type="info"
          showIcon
          title={`Bạn nộp thừa ${formatMoney(invoice.refundDue)}`}
          description="Số đã nộp nhiều hơn số phải nộp (hủy lớp, giảm tín chỉ). Phòng Kế hoạch - Tài chính hoàn lại hoặc cấn trừ, liên hệ phòng nếu cần nhận sớm."
        />
      )}
    </div>
  );
}

export function InvoiceList({ invoices, studentCode, currentTermId }: { invoices: TuitionInvoiceView[]; studentCode: string; currentTermId: string }) {
  const [messageApi, contextHolder] = message.useMessage();
  const outstanding = invoices.filter((invoice) => invoice.balance > 0);
  const history = invoices.filter((invoice) => invoice.balance === 0);
  const refunds = history.filter((invoice) => invoice.refundDue > 0);

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
        <EmptyState title="Chưa có khoản phải nộp" description="Học phí được tính sau khi kết thúc đợt điều chỉnh đăng ký." />
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      {outstanding.length === 0 && <Alert type="success" showIcon title="Bạn đã nộp đủ học phí các học kỳ" />}
      {refunds.map((invoice) => (
        <Alert
          key={invoice.id}
          type="info"
          showIcon
          title={`${invoice.termName}: nộp thừa ${formatMoney(invoice.refundDue)}`}
          description="Phòng Kế hoạch - Tài chính hoàn lại hoặc cấn trừ phần nộp thừa."
        />
      ))}
      {outstanding.map((invoice) => {
        const due = dueText(invoice);
        const content = transferContent(studentCode, invoice.termKey);
        return (
          <SectionCard key={invoice.id}>
            <div className="flex flex-col gap-4">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold">{invoice.termName}</h2>
                  <span className="text-xs text-muted tabular-nums">
                    {invoice.isFinal ? `Phát hành ${formatDate(invoice.issuedAt)} · Hạn nộp ${formatDate(invoice.dueDate)}` : "Tạm tính theo đăng ký hiện tại, chốt sau đợt điều chỉnh"}
                  </span>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <span className="text-xl font-semibold tabular-nums">{formatMoney(invoice.balance)}</span>
                  <span className="flex items-center gap-2">
                    {!invoice.isFinal && <StatusTag status={PROVISIONAL_INVOICE} />}
                    <StatusTag status={INVOICE_STATUS[invoice.status]} />
                    {due && <span className={`text-xs tabular-nums ${due.className}`}>{due.text}</span>}
                  </span>
                </div>
              </header>
              {invoice.status === "overdue" &&
                (invoice.termId === currentTermId ? (
                  <Alert
                    type="error"
                    showIcon
                    title="Tài khoản đang bị khóa đăng ký học phần"
                    description="Học phí học kỳ hiện tại quá hạn. Nộp đủ số còn nợ, khóa tự gỡ ngay khi Phòng Kế hoạch - Tài chính ghi nhận khoản nộp."
                  />
                ) : (
                  <Alert type="warning" showIcon title="Khoản nợ học kỳ trước" description="Phòng Kế hoạch - Tài chính có thể khóa đăng ký học phần tới khi bạn nộp đủ khoản này." />
                ))}
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
                              icon={<Copy size={14} aria-hidden className="text-zinc-500" />}
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
                              icon={<Copy size={14} aria-hidden className="text-zinc-500" />}
                              onClick={() => copy(content, "nội dung chuyển khoản")}
                            />
                          </span>
                        ),
                      },
                    ]}
                  />
                  <p className="text-xs text-pretty text-muted">Ghi đúng nội dung để Phòng Kế hoạch - Tài chính đối chiếu sao kê và ghi nhận nhanh. Sai nội dung, mang biên lai đến phòng.</p>
                </div>
              </div>
            </div>
          </SectionCard>
        );
      })}
      {history.length > 0 && (
        <SectionCard title="Các học kỳ đã nộp" flush>
          <Collapse
            bordered={false}
            ghost
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
        </SectionCard>
      )}
    </div>
  );
}
