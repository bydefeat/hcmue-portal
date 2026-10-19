ALTER TABLE terms ADD CONSTRAINT terms_no_overlap EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&);
--> statement-breakpoint
CREATE FUNCTION enrollments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  section_status class_section_status;
BEGIN
  IF NEW.status <> 'enrolled' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO section_status FROM class_sections WHERE id = NEW.class_section_id;
  IF section_status = 'cancelled' THEN
    RAISE EXCEPTION 'Lớp học phần đã hủy, không đăng ký được' USING ERRCODE = 'check_violation', CONSTRAINT = 'enrollments_section_not_cancelled';
  END IF;

  IF NEW.lab_group_id IS NULL AND EXISTS (SELECT 1 FROM lab_groups WHERE class_section_id = NEW.class_section_id) THEN
    RAISE EXCEPTION 'Lớp có nhóm thực hành, phải chọn một nhóm' USING ERRCODE = 'check_violation', CONSTRAINT = 'enrollments_lab_group_required';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER enrollments_guard
BEFORE INSERT OR UPDATE OF status, class_section_id, lab_group_id ON enrollments
FOR EACH ROW EXECUTE FUNCTION enrollments_guard();
--> statement-breakpoint
CREATE FUNCTION grade_scores_same_section() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM grade_components component
    JOIN grade_sheets sheet ON sheet.id = component.grade_sheet_id
    JOIN enrollments enrollment ON enrollment.class_section_id = sheet.class_section_id
    WHERE component.id = NEW.grade_component_id AND enrollment.id = NEW.enrollment_id
  ) THEN
    RAISE EXCEPTION 'Sinh viên không thuộc lớp của bảng điểm' USING ERRCODE = 'check_violation', CONSTRAINT = 'grade_scores_same_section';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER grade_scores_same_section
BEFORE INSERT OR UPDATE OF grade_component_id, enrollment_id ON grade_scores
FOR EACH ROW EXECUTE FUNCTION grade_scores_same_section();
--> statement-breakpoint
CREATE FUNCTION attendance_records_same_section() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM class_sessions session
    JOIN enrollments enrollment ON enrollment.class_section_id = session.class_section_id
    WHERE session.id = NEW.class_session_id AND enrollment.id = NEW.enrollment_id
  ) THEN
    RAISE EXCEPTION 'Sinh viên không thuộc lớp của buổi học' USING ERRCODE = 'check_violation', CONSTRAINT = 'attendance_records_same_section';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER attendance_records_same_section
BEFORE INSERT OR UPDATE OF class_session_id, enrollment_id ON attendance_records
FOR EACH ROW EXECUTE FUNCTION attendance_records_same_section();
--> statement-breakpoint
CREATE FUNCTION survey_submissions_enrolled() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM enrollments
    WHERE class_section_id = NEW.class_section_id AND student_id = NEW.student_id AND status = 'enrolled'
  ) THEN
    RAISE EXCEPTION 'Chỉ sinh viên đang học lớp mới được khảo sát lớp đó' USING ERRCODE = 'check_violation', CONSTRAINT = 'survey_submissions_enrolled';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER survey_submissions_enrolled
BEFORE INSERT OR UPDATE ON survey_submissions
FOR EACH ROW EXECUTE FUNCTION survey_submissions_enrolled();
--> statement-breakpoint
CREATE FUNCTION reserved_seats_within_capacity() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  section_id uuid;
  reserved integer;
  section_capacity integer;
BEGIN
  IF TG_TABLE_NAME = 'class_sections' THEN
    section_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN NULL;
  ELSE
    section_id := NEW.class_section_id;
  END IF;

  SELECT coalesce(sum(seats), 0) INTO reserved FROM reserved_seats WHERE class_section_id = section_id;
  SELECT capacity INTO section_capacity FROM class_sections WHERE id = section_id;

  IF reserved > section_capacity THEN
    RAISE EXCEPTION 'Tổng chỗ dành riêng (%) vượt sĩ số lớp (%)', reserved, section_capacity
      USING ERRCODE = 'check_violation', CONSTRAINT = 'reserved_seats_within_capacity';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER reserved_seats_within_capacity
AFTER INSERT OR UPDATE OF seats, class_section_id ON reserved_seats
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reserved_seats_within_capacity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER class_sections_capacity_covers_reserved
AFTER UPDATE OF capacity ON class_sections
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reserved_seats_within_capacity();
