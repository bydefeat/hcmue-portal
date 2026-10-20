-- Đề cương đã công bố: cách tính điểm (khóa, tên, trọng số theo thứ tự, cùng tiêu chí với gradingChanged ở teaching.rule.ts) chỉ
-- đổi được khi cùng giao dịch lưu bản cũ vào syllabus_revisions và tăng syllabi.version (writeSyllabus). Lưu đề cương xóa rồi chèn
-- lại mọi dòng đánh giá nên không chặn từng dòng: lần đầu sửa, xóa một dòng đánh giá của đề cương đã công bố trong giao dịch thì
-- nhớ cách tính điểm lúc đó (biến cấu hình cục bộ của giao dịch), lúc commit so với cách tính điểm cuối cùng. Chèn thêm dòng mà không
-- sửa, xóa dòng nào thì tổng trọng số lệch 100 và trigger syllabus_assessments_weights_total_100 đã chặn.
CREATE FUNCTION syllabus_grading_shape(target uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(key || chr(31) || label || chr(31) || weight::text, chr(30) ORDER BY position), '')
  FROM syllabus_assessments WHERE syllabus_id = target
$$;
--> statement-breakpoint
CREATE FUNCTION syllabus_revision_shape(items jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(string_agg((item ->> 'key') || chr(31) || (item ->> 'label') || chr(31) || (item ->> 'weight'), chr(30) ORDER BY position), '')
  FROM jsonb_array_elements(items) WITH ORDINALITY AS entry(item, position)
$$;
--> statement-breakpoint
CREATE FUNCTION syllabus_grading_setting(target uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'hcmue.syllabus_grading_' || replace(target::text, '-', '')
$$;
--> statement-breakpoint
CREATE FUNCTION syllabus_assessments_remember_grading() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Tiền tố "v" phân biệt "đã nhớ, không có đánh giá" với "chưa nhớ" (biến chưa đặt hoặc đã hết giao dịch trả chuỗi rỗng).
  IF coalesce(current_setting(syllabus_grading_setting(OLD.syllabus_id), true), '') = ''
    AND EXISTS (SELECT 1 FROM syllabi WHERE id = OLD.syllabus_id AND status = 'published') THEN
    PERFORM set_config(syllabus_grading_setting(OLD.syllabus_id), 'v' || syllabus_grading_shape(OLD.syllabus_id), true);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER syllabus_assessments_remember_grading
BEFORE UPDATE OR DELETE ON syllabus_assessments
FOR EACH ROW EXECUTE FUNCTION syllabus_assessments_remember_grading();
--> statement-breakpoint
CREATE FUNCTION syllabus_assessments_weights_versioned() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.syllabus_id ELSE NEW.syllabus_id END;
  remembered text := coalesce(current_setting(syllabus_grading_setting(target), true), '');
  previous text;
  current_version smallint;
BEGIN
  IF remembered = '' THEN
    RETURN NULL;
  END IF;
  previous := substr(remembered, 2);
  SELECT version INTO current_version FROM syllabi WHERE id = target AND status = 'published';
  IF NOT FOUND OR syllabus_grading_shape(target) = previous THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM syllabus_revisions revision
    WHERE revision.syllabus_id = target AND revision.version = current_version - 1 AND syllabus_revision_shape(revision.assessments) = previous
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Đề cương % đã công bố: đổi cách tính điểm phải lưu thành phiên bản mới', target
    USING ERRCODE = 'check_violation', CONSTRAINT = 'syllabus_assessments_weights_versioned';
END
$$;
--> statement-breakpoint
-- Tên xếp sau syllabus_assessments_weights_total_100 để lỗi tổng trọng số (nếu có) báo trước.
CREATE CONSTRAINT TRIGGER syllabus_assessments_weights_versioned
AFTER INSERT OR UPDATE OR DELETE ON syllabus_assessments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION syllabus_assessments_weights_versioned();
--> statement-breakpoint
-- Đề cương đã công bố không về nháp (về nháp rồi sửa là lách được khóa trên), phiên bản không lùi.
CREATE FUNCTION syllabi_published_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' AND NEW.status <> 'published' THEN
    RAISE EXCEPTION 'Đề cương đã công bố không chuyển về nháp được' USING ERRCODE = 'check_violation', CONSTRAINT = 'syllabi_published_final';
  END IF;
  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Phiên bản đề cương không giảm được' USING ERRCODE = 'check_violation', CONSTRAINT = 'syllabi_published_final';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER syllabi_published_final
BEFORE UPDATE OF status, version ON syllabi
FOR EACH ROW EXECUTE FUNCTION syllabi_published_final();
