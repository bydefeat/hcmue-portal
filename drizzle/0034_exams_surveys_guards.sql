-- Đề đã duyệt vẫn bị khóa tệp; Phòng Khảo thí chỉ được mở khóa bằng cách trả lại đề (approved -> returned, giữ nguyên tệp,
-- có lý do, có người xét). Mọi đổi khác của trạng thái hay tệp đề đã duyệt vẫn bị chặn như trước.
CREATE OR REPLACE FUNCTION exam_sessions_paper_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paper_storage_key IS DISTINCT FROM OLD.paper_storage_key
    OR NEW.paper_file_name IS DISTINCT FROM OLD.paper_file_name
    OR NEW.paper_content_type IS DISTINCT FROM OLD.paper_content_type
    OR NEW.paper_size_bytes IS DISTINCT FROM OLD.paper_size_bytes
    OR NEW.answer_key_storage_key IS DISTINCT FROM OLD.answer_key_storage_key
    OR NEW.answer_key_file_name IS DISTINCT FROM OLD.answer_key_file_name
    OR NEW.answer_key_content_type IS DISTINCT FROM OLD.answer_key_content_type
    OR NEW.answer_key_size_bytes IS DISTINCT FROM OLD.answer_key_size_bytes
    OR NEW.paper_submitted_at IS DISTINCT FROM OLD.paper_submitted_at
    OR (NEW.paper_status IS DISTINCT FROM OLD.paper_status AND NEW.paper_status::text <> 'returned') THEN
    RAISE EXCEPTION 'Đề thi đã được duyệt, không thay đổi được' USING ERRCODE = 'check_violation', CONSTRAINT = 'exam_sessions_paper_locked';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
-- Tới giờ thi thì không nộp, thay đề nữa (server cũng chặn; đây chặn cả khi ghi thẳng vào DB).
CREATE FUNCTION exam_sessions_paper_after_start() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paper_submitted_at IS DISTINCT FROM OLD.paper_submitted_at
    AND NEW.paper_submitted_at IS NOT NULL
    AND ((OLD.date + OLD.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh') <= now() THEN
    RAISE EXCEPTION 'Ca thi đã bắt đầu, không nộp đề được nữa' USING ERRCODE = 'check_violation', CONSTRAINT = 'exam_sessions_paper_after_start';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER exam_sessions_paper_after_start
  BEFORE UPDATE OF paper_submitted_at ON exam_sessions
  FOR EACH ROW
  EXECUTE FUNCTION exam_sessions_paper_after_start();--> statement-breakpoint
-- Đề nghị đổi ca: lúc gửi người gửi phải đang coi ca đó. Không còn khóa ngoại tới exam_proctors để giữ lịch sử khi người gửi
-- được gỡ khỏi ca.
CREATE FUNCTION exam_proctor_swap_requests_proctor() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM exam_proctors WHERE exam_session_id = NEW.exam_session_id AND lecturer_id = NEW.requester_id) THEN
    RAISE EXCEPTION 'Người gửi không còn được phân công coi ca thi này' USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'exam_proctor_swap_requests_proctor_fk';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER exam_proctor_swap_requests_proctor
  BEFORE INSERT ON exam_proctor_swap_requests
  FOR EACH ROW
  EXECUTE FUNCTION exam_proctor_swap_requests_proctor();
--> statement-breakpoint
-- Câu hỏi đã có câu trả lời thì không sửa, xóa được; phiếu đã có người trả lời thì không thêm câu hỏi (kết quả các phiếu phải
-- cùng một bộ câu hỏi). Server còn chặn sớm hơn: chỉ sửa câu hỏi khi đợt chưa mở.
CREATE FUNCTION survey_questions_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM survey_responses WHERE survey_id = NEW.survey_id) THEN
      RAISE EXCEPTION 'Đợt khảo sát đã có phiếu trả lời, không thêm câu hỏi được' USING ERRCODE = 'check_violation', CONSTRAINT = 'survey_questions_locked';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM survey_answers WHERE question_id = OLD.id) THEN
    RAISE EXCEPTION 'Câu hỏi đã có câu trả lời, không sửa, xóa được' USING ERRCODE = 'check_violation', CONSTRAINT = 'survey_questions_locked';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;--> statement-breakpoint
CREATE TRIGGER survey_questions_locked
  BEFORE INSERT OR UPDATE OR DELETE ON survey_questions
  FOR EACH ROW
  EXECUTE FUNCTION survey_questions_locked();
