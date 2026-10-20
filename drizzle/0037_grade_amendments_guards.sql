-- Hai tham số quy chế mới (điểm I, rút học phần) cho các bản quy chế đã lưu, giá trị mặc định theo quy chế hiện hành.
UPDATE "regulations"
SET "rules" = jsonb_set(
  jsonb_set("rules", '{grading,incompleteTerms}', coalesce("rules" -> 'grading' -> 'incompleteTerms', '1'::jsonb)),
  '{workflow,withdrawDeadlineWeeks}',
  coalesce("rules" -> 'workflow' -> 'withdrawDeadlineWeeks', '8'::jsonb)
);
--> statement-breakpoint
-- Chốt điểm: sinh viên đang được hoãn thi (exam_deferrals) được để trống điểm, công bố thì nhận điểm I; các sinh viên khác phải đủ điểm.
CREATE OR REPLACE FUNCTION grade_sheets_status_flow() RETURNS trigger
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
        AND NOT EXISTS (SELECT 1 FROM exam_deferrals deferral WHERE deferral.enrollment_id = enrollment.id)
    )
    INTO expected
    FROM grade_components component
    WHERE component.grade_sheet_id = NEW.id;

    SELECT count(*) INTO filled
    FROM grade_scores score
    JOIN grade_components component ON component.id = score.grade_component_id
    JOIN enrollments enrollment ON enrollment.id = score.enrollment_id AND enrollment.status = 'enrolled'
    WHERE component.grade_sheet_id = NEW.id
      AND NOT EXISTS (SELECT 1 FROM exam_deferrals deferral WHERE deferral.enrollment_id = enrollment.id);

    IF NOT EXISTS (SELECT 1 FROM enrollments enrollment WHERE enrollment.class_section_id = NEW.class_section_id AND enrollment.status = 'enrolled')
      OR filled < expected THEN
      RAISE EXCEPTION 'Bảng điểm còn % ô chưa nhập', expected - filled USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_sheets_incomplete';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Bảng điểm đã chốt không sửa được điểm, trừ khi điểm ghi đúng theo một đề nghị sửa điểm vừa được duyệt trong cùng giao dịch
-- (decided_at = now(), thời điểm bắt đầu giao dịch): mọi thay đổi điểm sau khi chốt đều đi qua grade_amendments.
CREATE OR REPLACE FUNCTION grade_sheet_editable() RETURNS trigger
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

  IF sheet_status IS NOT NULL AND sheet_status NOT IN ('draft', 'returned') THEN
    -- IF lồng nhau: NEW của grade_components không có các cột này.
    IF TG_TABLE_NAME = 'grade_scores' AND TG_OP IN ('INSERT', 'UPDATE') THEN
      IF EXISTS (
        SELECT 1 FROM grade_amendments amendment
        WHERE amendment.grade_component_id = NEW.grade_component_id
          AND amendment.enrollment_id = NEW.enrollment_id
          AND amendment.status = 'approved'
          AND amendment.new_score = NEW.score
          AND amendment.decided_at = now()
      ) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Bảng điểm đã chốt, không sửa được' USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_sheet_locked';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Đề nghị sửa điểm: chỉ cho bảng điểm đã chốt trở đi, cột điểm thuộc đúng bảng điểm, sinh viên đang học đúng lớp của bảng điểm.
-- Đã duyệt hoặc từ chối thì không đổi nữa (chỉ khóa ngoại tự đặt trống khi xóa đơn, tài khoản).
CREATE FUNCTION grade_amendments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sheet_status grade_sheet_status;
  sheet_section uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' AND (
      NEW.status IS DISTINCT FROM OLD.status OR NEW.new_score IS DISTINCT FROM OLD.new_score OR NEW.old_score IS DISTINCT FROM OLD.old_score
      OR NEW.decided_at IS DISTINCT FROM OLD.decided_at OR NEW.decided_by_name IS DISTINCT FROM OLD.decided_by_name
      OR NEW.decision_note IS DISTINCT FROM OLD.decision_note OR NEW.result_before IS DISTINCT FROM OLD.result_before OR NEW.result_after IS DISTINCT FROM OLD.result_after
    ) THEN
      RAISE EXCEPTION 'Đề nghị sửa điểm đã xử lý, không đổi được' USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_amendments_decided_locked';
    END IF;
    IF NEW.grade_sheet_id <> OLD.grade_sheet_id OR NEW.grade_component_id <> OLD.grade_component_id OR NEW.enrollment_id <> OLD.enrollment_id
      OR NEW.student_id <> OLD.student_id OR NEW.source <> OLD.source OR NEW.requested_at <> OLD.requested_at OR NEW.requested_by_name <> OLD.requested_by_name THEN
      RAISE EXCEPTION 'Không đổi được đối tượng của đề nghị sửa điểm' USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_amendments_decided_locked';
    END IF;
    RETURN NEW;
  END IF;

  SELECT sheet.status, sheet.class_section_id INTO sheet_status, sheet_section FROM grade_sheets sheet WHERE sheet.id = NEW.grade_sheet_id;
  IF sheet_status IS NULL OR sheet_status IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'Bảng điểm chưa chốt, sửa trực tiếp trên bảng điểm' USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_amendments_sheet_locked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM grade_components component WHERE component.id = NEW.grade_component_id AND component.grade_sheet_id = NEW.grade_sheet_id) THEN
    RAISE EXCEPTION 'Cột điểm không thuộc bảng điểm' USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_amendments_same_sheet';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM enrollments enrollment
    WHERE enrollment.id = NEW.enrollment_id AND enrollment.class_section_id = sheet_section AND enrollment.student_id = NEW.student_id AND enrollment.status = 'enrolled'
  ) THEN
    RAISE EXCEPTION 'Sinh viên không học lớp của bảng điểm' USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_amendments_same_sheet';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER grade_amendments_guard
BEFORE INSERT OR UPDATE ON grade_amendments
FOR EACH ROW EXECUTE FUNCTION grade_amendments_guard();
