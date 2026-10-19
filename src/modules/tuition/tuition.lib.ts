import "server-only";
import { sql } from "drizzle-orm";

// Tổng phải nộp (các dòng trừ miễn giảm, không âm) và tổng đã nộp còn hiệu lực (bỏ khoản đã hủy) của dòng tuition_invoices đang chọn,
// tính trong SQL để danh sách lớn không phải nạp từng dòng. Cùng công thức với trigger payments_within_invoice_total.
// Viết tên bảng đầy đủ: drizzle bỏ tên bảng khi truy vấn chỉ có một bảng, khi đó "id" trong truy vấn con trỏ nhầm sang id của bảng con.
export const INVOICE_TOTAL_SQL = sql<number>`greatest(0, coalesce((SELECT sum(line.amount) FROM invoice_lines line WHERE line.invoice_id = "tuition_invoices"."id"), 0) - "tuition_invoices"."discount")`.mapWith(Number);
export const INVOICE_PAID_SQL = sql<number>`coalesce((SELECT sum(payment.amount) FROM payments payment WHERE payment.invoice_id = "tuition_invoices"."id" AND payment.voided_at IS NULL), 0)`.mapWith(Number);
