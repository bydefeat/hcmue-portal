CREATE FUNCTION enrollments_sync_counts() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'enrolled' THEN
    UPDATE class_sections SET enrolled_count = enrolled_count - 1 WHERE id = OLD.class_section_id;
    IF OLD.lab_group_id IS NOT NULL THEN
      UPDATE lab_groups SET enrolled_count = enrolled_count - 1 WHERE id = OLD.lab_group_id;
    END IF;
    IF OLD.reserved_seat_id IS NOT NULL THEN
      UPDATE reserved_seats SET taken_count = taken_count - 1 WHERE id = OLD.reserved_seat_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'enrolled' THEN
    UPDATE class_sections SET enrolled_count = enrolled_count + 1 WHERE id = NEW.class_section_id;
    IF NEW.lab_group_id IS NOT NULL THEN
      UPDATE lab_groups SET enrolled_count = enrolled_count + 1 WHERE id = NEW.lab_group_id;
    END IF;
    IF NEW.reserved_seat_id IS NOT NULL THEN
      UPDATE reserved_seats SET taken_count = taken_count + 1 WHERE id = NEW.reserved_seat_id;
    END IF;
  END IF;

  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER enrollments_sync_counts
AFTER INSERT OR DELETE OR UPDATE OF status, class_section_id, lab_group_id, reserved_seat_id ON enrollments
FOR EACH ROW EXECUTE FUNCTION enrollments_sync_counts();
--> statement-breakpoint
CREATE FUNCTION assert_weights_total_100() RETURNS trigger
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
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER grade_components_weights_total_100
AFTER INSERT OR UPDATE OR DELETE ON grade_components
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_weights_total_100('grade_sheet_id');
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER syllabus_assessments_weights_total_100
AFTER INSERT OR UPDATE OR DELETE ON syllabus_assessments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_weights_total_100('syllabus_id');
