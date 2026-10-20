ALTER TYPE "public"."audit_action" ADD VALUE 'cancel';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'download';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'mail';--> statement-breakpoint
ALTER TYPE "public"."mail_kind" ADD VALUE 'announcement';--> statement-breakpoint
CREATE TABLE "request_supplements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"request_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_name" text NOT NULL,
	"request_note" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"response_note" text,
	CONSTRAINT "request_supplements_note_not_blank" CHECK (btrim("request_supplements"."request_note") <> ''),
	CONSTRAINT "request_supplements_response_fields" CHECK ("request_supplements"."responded_at" IS NOT NULL OR "request_supplements"."response_note" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "request_steps" DROP CONSTRAINT "request_steps_acted_fields";--> statement-breakpoint
ALTER TABLE "request_steps" DROP CONSTRAINT "request_steps_lecturer_assignee";--> statement-breakpoint
ALTER TABLE "report_exports" DROP CONSTRAINT "report_exports_done_fields";--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "audience" jsonb DEFAULT '{"students":true,"lecturers":true,"cohorts":[],"facultyIds":[],"majorIds":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "notify_portal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "notify_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "academic_requests" ADD COLUMN "class_section_id" uuid;--> statement-breakpoint
ALTER TABLE "academic_requests" ADD COLUMN "resubmitted_from_id" uuid;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "on_behalf" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "reassigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "reassigned_by_name" text;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "reassign_reason" text;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "due_soon_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "overdue_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_exports" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "report_exports" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "report_exports" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "request_supplements" ADD CONSTRAINT "request_supplements_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_supplements" ADD CONSTRAINT "request_supplements_step_id_request_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."request_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_supplements" ADD CONSTRAINT "request_supplements_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_supplements_request_id_requested_at_index" ON "request_supplements" USING btree ("request_id","requested_at");--> statement-breakpoint
CREATE INDEX "request_supplements_step_id_index" ON "request_supplements" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "request_supplements_requested_by_user_id_index" ON "request_supplements" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_supplements_one_open" ON "request_supplements" USING btree ("request_id") WHERE "request_supplements"."responded_at" IS NULL;--> statement-breakpoint
ALTER TABLE "academic_requests" ADD CONSTRAINT "academic_requests_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_requests" ADD CONSTRAINT "academic_requests_resubmitted_from_id_academic_requests_id_fk" FOREIGN KEY ("resubmitted_from_id") REFERENCES "public"."academic_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_read_at" ON "notifications" USING btree ("read_at") WHERE "notifications"."read_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "academic_requests_class_section_id_index" ON "academic_requests" USING btree ("class_section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_requests_resubmitted_from_unique" ON "academic_requests" USING btree ("resubmitted_from_id") WHERE "academic_requests"."resubmitted_from_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "request_steps_pending_due_at" ON "request_steps" USING btree ("due_at") WHERE "request_steps"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "report_exports_created_at_index" ON "report_exports" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "announcements" DROP COLUMN "audiences";--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_object" CHECK (jsonb_typeof("announcements"."audience") = 'object');--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_reassign_fields" CHECK (("request_steps"."reassigned_at" IS NULL) = ("request_steps"."reassigned_by_name" IS NULL) AND ("request_steps"."reassigned_at" IS NULL) = ("request_steps"."reassign_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_on_behalf_reason" CHECK (NOT "request_steps"."on_behalf" OR ("request_steps"."acted_at" IS NOT NULL AND "request_steps"."comment" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_skipped_on_behalf" CHECK ("request_steps"."status" <> 'skipped' OR "request_steps"."on_behalf");--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_acted_fields" CHECK (("request_steps"."status" IN ('approved', 'rejected', 'skipped')) = ("request_steps"."acted_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_lecturer_assignee" CHECK (("request_steps"."role" <> 'lecturer' OR "request_steps"."assignee_lecturer_id" IS NOT NULL) AND ("request_steps"."role" IN ('advisor', 'lecturer') OR "request_steps"."assignee_lecturer_id" IS NULL));--> statement-breakpoint
-- Bản xuất cũ không có tệp thật trong kho: xóa trước khi thêm ràng buộc mới.
DELETE FROM "report_exports" WHERE "status" = 'done' AND "file_name" IS NULL;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_done_fields" CHECK (("report_exports"."status" = 'done') = ("report_exports"."storage_key" IS NOT NULL AND "report_exports"."row_count" IS NOT NULL AND "report_exports"."file_name" IS NOT NULL AND "report_exports"."content_type" IS NOT NULL AND "report_exports"."size_bytes" IS NOT NULL));