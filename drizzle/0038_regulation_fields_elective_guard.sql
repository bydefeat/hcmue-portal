-- Hai tham số quy chế mới (slot g): bản quy chế đã lưu trước đó nhận giá trị mặc định để form và nơi đọc không gặp ô trống.
-- credits.overloadExtraCredits: học vượt được duyệt tối đa maxPerTerm + số này (trước đây là hằng số 5 trong code).
-- workflow.maxReserveTerms: tổng số học kỳ bảo lưu tối đa (mặc định 2).
UPDATE regulations
SET rules = jsonb_set(rules, '{credits,overloadExtraCredits}', '5'::jsonb, true)
WHERE jsonb_typeof(rules -> 'credits') = 'object' AND NOT (rules -> 'credits') ? 'overloadExtraCredits';
--> statement-breakpoint
UPDATE regulations
SET rules = jsonb_set(rules, '{workflow,maxReserveTerms}', '2'::jsonb, true)
WHERE jsonb_typeof(rules -> 'workflow') = 'object' AND NOT (rules -> 'workflow') ? 'maxReserveTerms';
--> statement-breakpoint
-- Nhóm tự chọn của chương trình đã ngừng áp dụng chỉ xem được, như khung (program_courses_guard).
CREATE FUNCTION program_elective_groups_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  program_status program_status;
BEGIN
  SELECT status INTO program_status FROM programs WHERE id = COALESCE(NEW.program_id, OLD.program_id);
  IF program_status = 'archived' THEN
    RAISE EXCEPTION 'Chương trình đã ngừng áp dụng, không sửa được nhóm tự chọn'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'program_elective_groups_program_archived';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER program_elective_groups_guard
BEFORE INSERT OR UPDATE OR DELETE ON program_elective_groups
FOR EACH ROW EXECUTE FUNCTION program_elective_groups_guard();
--> statement-breakpoint
-- Học phần trong nhóm tự chọn phải là học phần tự chọn, không phải học phần điều kiện (điều kiện không tính tín chỉ tích lũy
-- nên không góp vào số tín chỉ tối thiểu của nhóm).
CREATE FUNCTION program_courses_elective_group_course() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.elective_group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM courses WHERE id = NEW.course_id AND (type <> 'elective' OR is_conditional)
  ) THEN
    RAISE EXCEPTION 'Chỉ học phần tự chọn (không phải học phần điều kiện) mới xếp vào nhóm tự chọn'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'program_courses_elective_group_course';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER program_courses_elective_group_course
BEFORE INSERT OR UPDATE OF elective_group_id, course_id ON program_courses
FOR EACH ROW EXECUTE FUNCTION program_courses_elective_group_course();
