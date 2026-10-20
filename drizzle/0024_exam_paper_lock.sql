-- Đề thi đã được Phòng Khảo thí duyệt thì bị khóa: không đổi trạng thái đề, không thay tệp đề, đáp án (kể cả khi ghi thẳng
-- vào DB, không qua server action). Xóa ca thi (xóa lớp) vẫn được vì trigger chỉ chặn UPDATE.
CREATE OR REPLACE FUNCTION exam_sessions_paper_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paper_status IS DISTINCT FROM OLD.paper_status
    OR NEW.paper_storage_key IS DISTINCT FROM OLD.paper_storage_key
    OR NEW.paper_file_name IS DISTINCT FROM OLD.paper_file_name
    OR NEW.paper_content_type IS DISTINCT FROM OLD.paper_content_type
    OR NEW.paper_size_bytes IS DISTINCT FROM OLD.paper_size_bytes
    OR NEW.answer_key_storage_key IS DISTINCT FROM OLD.answer_key_storage_key
    OR NEW.answer_key_file_name IS DISTINCT FROM OLD.answer_key_file_name
    OR NEW.answer_key_content_type IS DISTINCT FROM OLD.answer_key_content_type
    OR NEW.answer_key_size_bytes IS DISTINCT FROM OLD.answer_key_size_bytes
    OR NEW.paper_submitted_at IS DISTINCT FROM OLD.paper_submitted_at THEN
    RAISE EXCEPTION 'Đề thi đã được duyệt, không thay đổi được' USING ERRCODE = 'check_violation', CONSTRAINT = 'exam_sessions_paper_locked';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER exam_sessions_paper_locked
  BEFORE UPDATE ON exam_sessions
  FOR EACH ROW
  WHEN (OLD.paper_status = 'approved')
  EXECUTE FUNCTION exam_sessions_paper_locked();
