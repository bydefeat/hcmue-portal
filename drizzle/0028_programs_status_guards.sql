-- Chương trình đã ngừng áp dụng là trạng thái cuối: không mở lại (sinh viên khóa cũ đã xét theo khung đó).
CREATE FUNCTION programs_archived_final() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Chương trình đã ngừng áp dụng, không mở lại được'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'programs_archived_final';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER programs_archived_final
BEFORE UPDATE OF status ON programs
FOR EACH ROW EXECUTE FUNCTION programs_archived_final();
--> statement-breakpoint
-- Mỗi ngành, khóa chỉ một chương trình đang áp dụng (nguồn chọn chương trình cho xét tốt nghiệp, kế hoạch học tập). Kiểm lúc commit
-- vì lưu chương trình xóa rồi thêm lại khóa áp dụng trong cùng giao dịch.
CREATE FUNCTION programs_single_active_cohort() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid;
  clash record;
BEGIN
  IF TG_TABLE_NAME = 'programs' THEN
    target := NEW.id;
  ELSE
    target := NEW.program_id;
  END IF;
  SELECT p.major_id, c.cohort INTO clash
  FROM programs p
  JOIN program_cohorts c ON c.program_id = p.id
  WHERE p.status = 'active'
    AND p.id = target
    AND EXISTS (
      SELECT 1 FROM programs other
      JOIN program_cohorts other_cohort ON other_cohort.program_id = other.id
      WHERE other.id <> p.id AND other.status = 'active' AND other.major_id = p.major_id AND other_cohort.cohort = c.cohort
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Khóa % của ngành đã có chương trình đang áp dụng', clash.cohort
      USING ERRCODE = 'check_violation', CONSTRAINT = 'programs_single_active_cohort';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER programs_single_active_cohort
AFTER INSERT OR UPDATE OF status, major_id ON programs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION programs_single_active_cohort();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER program_cohorts_single_active
AFTER INSERT OR UPDATE ON program_cohorts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION programs_single_active_cohort();
