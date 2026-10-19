-- Tổng các khoản thanh toán còn hiệu lực của một hóa đơn không vượt số phải nộp (tổng các dòng trừ miễn giảm).
-- Khóa dòng hóa đơn để hai giao dịch ghi cùng lúc cho một hóa đơn phải chờ nhau, không cùng lọt qua phép cộng.
CREATE FUNCTION payments_within_invoice_total() RETURNS trigger
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

  SELECT coalesce(sum(payment.amount), 0) INTO paid
  FROM payments payment
  WHERE payment.invoice_id = NEW.invoice_id AND payment.voided_at IS NULL;

  IF paid > total THEN
    RAISE EXCEPTION 'Tổng đã nộp % vượt số phải nộp % của hóa đơn', paid, total
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_within_invoice_total';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER payments_within_invoice_total
AFTER INSERT OR UPDATE OF invoice_id, amount, voided_at ON payments
FOR EACH ROW EXECUTE FUNCTION payments_within_invoice_total();
