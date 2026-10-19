-- Khung chương trình: chương trình ngừng áp dụng thì khung chỉ xem; học kỳ không vượt số năm đào tạo × 2 (khung không có học kỳ hè).
CREATE FUNCTION program_courses_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  program_status program_status;
  program_years smallint;
BEGIN
  SELECT program.status, program.duration_years INTO program_status, program_years
  FROM programs program
  WHERE program.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;

  -- Không còn chương trình (đang xóa dây chuyền từ chương trình) thì cho qua.
  IF program_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF program_status = 'archived' THEN
    RAISE EXCEPTION 'Chương trình đã ngừng áp dụng, không sửa được khung'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'program_courses_program_archived';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.semester > program_years * 2 THEN
    RAISE EXCEPTION 'Học kỳ % vượt quá % năm đào tạo', NEW.semester, program_years
      USING ERRCODE = 'check_violation', CONSTRAINT = 'program_courses_semester_within_duration';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER program_courses_guard
BEFORE INSERT OR UPDATE OR DELETE ON program_courses
FOR EACH ROW EXECUTE FUNCTION program_courses_guard();
--> statement-breakpoint
-- Rút ngắn thời gian đào tạo khi khung còn học phần ở học kỳ cuối thì chặn, để khung không lệch thời gian đào tạo.
CREATE FUNCTION programs_duration_covers_courses() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM program_courses entry WHERE entry.program_id = NEW.id AND entry.semester > NEW.duration_years * 2) THEN
    RAISE EXCEPTION 'Khung còn học phần sau học kỳ %', NEW.duration_years * 2
      USING ERRCODE = 'check_violation', CONSTRAINT = 'program_courses_semester_within_duration';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER programs_duration_covers_courses
BEFORE UPDATE OF duration_years ON programs
FOR EACH ROW
WHEN (NEW.duration_years < OLD.duration_years)
EXECUTE FUNCTION programs_duration_covers_courses();
--> statement-breakpoint
-- Cảnh báo học vụ đã gửi thông báo hoặc đã gặp sinh viên thì giữ nguyên nội dung đã báo: sinh lại cảnh báo không được đổi mức, lý do.
CREATE FUNCTION academic_warnings_handled_locked() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'new' AND (
    NEW.level IS DISTINCT FROM OLD.level
    OR NEW.term_gpa4 IS DISTINCT FROM OLD.term_gpa4
    OR NEW.cpa4 IS DISTINCT FROM OLD.cpa4
    OR NEW.failed_credits IS DISTINCT FROM OLD.failed_credits
    OR NEW.reasons IS DISTINCT FROM OLD.reasons
  ) THEN
    RAISE EXCEPTION 'Cảnh báo đã xử lý, không đổi được mức và lý do'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'academic_warnings_handled_locked';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER academic_warnings_handled_locked
BEFORE UPDATE ON academic_warnings
FOR EACH ROW EXECUTE FUNCTION academic_warnings_handled_locked();
