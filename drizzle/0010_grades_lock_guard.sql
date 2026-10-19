-- Bảng điểm đi đúng quy trình: nháp → chốt → khoa duyệt (hoặc trả lại) → công bố. Chốt rồi thì điểm và cột điểm không sửa được.
CREATE FUNCTION grade_sheets_status_flow() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected integer;
  filled integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Bảng điểm mới phải ở trạng thái nháp' USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_sheets_status_flow';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status IN ('draft', 'returned') AND NEW.status = 'locked')
    OR (OLD.status = 'locked' AND NEW.status IN ('approved', 'returned'))
    OR (OLD.status = 'approved' AND NEW.status = 'published')
  ) THEN
    RAISE EXCEPTION 'Bảng điểm không chuyển được từ % sang %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_sheets_status_flow';
  END IF;

  IF NEW.status = 'locked' THEN
    SELECT count(*) * (
      SELECT count(*) FROM enrollments enrollment
      WHERE enrollment.class_section_id = NEW.class_section_id AND enrollment.status = 'enrolled'
    )
    INTO expected
    FROM grade_components component
    WHERE component.grade_sheet_id = NEW.id;

    SELECT count(*) INTO filled
    FROM grade_scores score
    JOIN grade_components component ON component.id = score.grade_component_id
    JOIN enrollments enrollment ON enrollment.id = score.enrollment_id AND enrollment.status = 'enrolled'
    WHERE component.grade_sheet_id = NEW.id;

    IF expected = 0 OR filled < expected THEN
      RAISE EXCEPTION 'Bảng điểm còn % ô chưa nhập', expected - filled USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_sheets_incomplete';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER grade_sheets_status_flow
BEFORE INSERT OR UPDATE OF status ON grade_sheets
FOR EACH ROW EXECUTE FUNCTION grade_sheets_status_flow();
--> statement-breakpoint
CREATE FUNCTION grade_sheet_editable() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sheet_status grade_sheet_status;
BEGIN
  IF TG_TABLE_NAME = 'grade_scores' THEN
    SELECT sheet.status INTO sheet_status
    FROM grade_components component
    JOIN grade_sheets sheet ON sheet.id = component.grade_sheet_id
    WHERE component.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.grade_component_id ELSE NEW.grade_component_id END;
  ELSE
    SELECT sheet.status INTO sheet_status
    FROM grade_sheets sheet
    WHERE sheet.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.grade_sheet_id ELSE NEW.grade_sheet_id END;
  END IF;

  -- Không còn bảng điểm (đang xóa dây chuyền từ bảng điểm) thì cho qua.
  IF sheet_status IS NOT NULL AND sheet_status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'Bảng điểm đã chốt, không sửa được' USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_sheet_locked';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER grade_scores_sheet_locked
BEFORE INSERT OR UPDATE OR DELETE ON grade_scores
FOR EACH ROW EXECUTE FUNCTION grade_sheet_editable();
--> statement-breakpoint
CREATE TRIGGER grade_components_sheet_locked
BEFORE INSERT OR UPDATE OR DELETE ON grade_components
FOR EACH ROW EXECUTE FUNCTION grade_sheet_editable();
--> statement-breakpoint
-- Gắn tên ràng buộc (tên trigger) vào lỗi tổng trọng số để pgErrorMessage tra được câu tiếng Việt của module.
CREATE OR REPLACE FUNCTION assert_weights_total_100() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_column text := TG_ARGV[0];
  parent_id uuid;
  total integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_id := (to_jsonb(OLD) ->> parent_column)::uuid;
  ELSE
    parent_id := (to_jsonb(NEW) ->> parent_column)::uuid;
  END IF;

  EXECUTE format('SELECT sum(weight) FROM %I WHERE %I = $1', TG_TABLE_NAME, parent_column) INTO total USING parent_id;

  IF total IS NOT NULL AND total <> 100 THEN
    RAISE EXCEPTION 'Tổng trọng số của % % là %, phải bằng 100', TG_TABLE_NAME, parent_id, total
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END
$$;
