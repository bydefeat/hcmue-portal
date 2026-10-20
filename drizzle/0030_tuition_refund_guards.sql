-- Số đã nộp tính trừ phần đã hoàn: tổng thanh toán còn hiệu lực trừ tổng hoàn không vượt số phải nộp khi ghi thêm thanh toán.
-- Số phải nộp có thể giảm sau khi đã nộp (hủy lớp, điều chỉnh sau chốt); khi đó phần thừa là số cần hoàn, không chặn.
CREATE OR REPLACE FUNCTION payments_within_invoice_total() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total numeric;
  paid numeric;
BEGIN
  IF NEW.voided_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  PERFORM 1 FROM tuition_invoices WHERE id = NEW.invoice_id FOR UPDATE;

  SELECT greatest(0, coalesce((SELECT sum(line.amount) FROM invoice_lines line WHERE line.invoice_id = invoice.id), 0) - invoice.discount)
  INTO total
  FROM tuition_invoices invoice
  WHERE invoice.id = NEW.invoice_id;

  SELECT coalesce((SELECT sum(payment.amount) FROM payments payment WHERE payment.invoice_id = NEW.invoice_id AND payment.voided_at IS NULL), 0)
    - coalesce((SELECT sum(refund.amount) FROM tuition_refunds refund WHERE refund.invoice_id = NEW.invoice_id), 0)
  INTO paid;

  IF paid > total THEN
    RAISE EXCEPTION 'Tổng đã nộp % vượt số phải nộp % của hóa đơn', paid, total
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_within_invoice_total';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- Chỉ hoàn phần đã nộp thừa: sau khi hoàn, số đã nộp (trừ hoàn) không nhỏ hơn số phải nộp.
CREATE FUNCTION tuition_refunds_within_overpaid() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total numeric;
  paid numeric;
BEGIN
  PERFORM 1 FROM tuition_invoices WHERE id = NEW.invoice_id FOR UPDATE;

  SELECT greatest(0, coalesce((SELECT sum(line.amount) FROM invoice_lines line WHERE line.invoice_id = invoice.id), 0) - invoice.discount)
  INTO total
  FROM tuition_invoices invoice
  WHERE invoice.id = NEW.invoice_id;

  SELECT coalesce((SELECT sum(payment.amount) FROM payments payment WHERE payment.invoice_id = NEW.invoice_id AND payment.voided_at IS NULL), 0)
    - coalesce((SELECT sum(refund.amount) FROM tuition_refunds refund WHERE refund.invoice_id = NEW.invoice_id), 0)
  INTO paid;

  IF paid < total THEN
    RAISE EXCEPTION 'Hoàn vượt số nộp thừa của hóa đơn (đã nộp sau hoàn %, phải nộp %)', paid, total
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tuition_refunds_within_overpaid';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tuition_refunds_within_overpaid
AFTER INSERT OR UPDATE OF invoice_id, amount ON tuition_refunds
FOR EACH ROW EXECUTE FUNCTION tuition_refunds_within_overpaid();
