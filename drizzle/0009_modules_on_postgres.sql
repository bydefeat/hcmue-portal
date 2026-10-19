CREATE TYPE "public"."notification_audience" AS ENUM('student', 'lecturer', 'administrator');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'calendar-event';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'report';--> statement-breakpoint
ALTER TYPE "public"."course_result_source" ADD VALUE 'legacy';--> statement-breakpoint
CREATE TABLE "exam_proctor_swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"exam_session_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"substitute_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "exam_proctor_swap_requests_distinct_people" CHECK ("exam_proctor_swap_requests"."requester_id" <> "exam_proctor_swap_requests"."substitute_id"),
	CONSTRAINT "exam_proctor_swap_requests_reason_present" CHECK (length(btrim("exam_proctor_swap_requests"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "class_sessions" DROP CONSTRAINT "class_sessions_class_section_id_date_start_period_unique";--> statement-breakpoint
DROP INDEX "notifications_recipient_user_id_created_at_index";--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "author_label" text DEFAULT 'Phòng Đào tạo' NOT NULL;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD COLUMN "tuition_cleared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD COLUMN "discipline_free" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Thông báo đã có trước khi tách theo cổng được gán cho cổng sinh viên; cột không giữ mặc định.
ALTER TABLE "notifications" ADD COLUMN "audience" "notification_audience" DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "audience" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "lab_group_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD CONSTRAINT "exam_proctor_swap_requests_substitute_id_lecturers_id_fk" FOREIGN KEY ("substitute_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD CONSTRAINT "exam_proctor_swap_requests_proctor_fk" FOREIGN KEY ("exam_session_id","requester_id") REFERENCES "public"."exam_proctors"("exam_session_id","lecturer_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_proctor_swap_requests_single_pending" ON "exam_proctor_swap_requests" USING btree ("exam_session_id","requester_id") WHERE "exam_proctor_swap_requests"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "exam_proctor_swap_requests_requester_id_index" ON "exam_proctor_swap_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "exam_proctor_swap_requests_substitute_id_index" ON "exam_proctor_swap_requests" USING btree ("substitute_id");--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_lab_group_fk" FOREIGN KEY ("lab_group_id","class_section_id") REFERENCES "public"."lab_groups"("id","class_section_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_user_id_audience_created_at_index" ON "notifications" USING btree ("recipient_user_id","audience","created_at");--> statement-breakpoint
CREATE INDEX "class_sessions_lab_group_id_index" ON "class_sessions" USING btree ("lab_group_id");--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_slot_unique" UNIQUE NULLS NOT DISTINCT("class_section_id","date","start_period","lab_group_id");