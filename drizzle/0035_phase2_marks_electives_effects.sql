CREATE TYPE "public"."grade_amendment_source" AS ENUM('regrade', 'grade-change', 'manual');--> statement-breakpoint
CREATE TYPE "public"."grade_amendment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."enrollment_status" ADD VALUE 'withdrawn';--> statement-breakpoint
ALTER TYPE "public"."registration_event_kind" ADD VALUE 'waitlist-expired';--> statement-breakpoint
CREATE TABLE "credit_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"term_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"max_credits" smallint NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_overrides_term_id_student_id_unique" UNIQUE("term_id","student_id"),
	CONSTRAINT "credit_overrides_max_credits_range" CHECK ("credit_overrides"."max_credits" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "program_elective_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_credits" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_elective_groups_program_id_name_unique" UNIQUE("program_id","name"),
	CONSTRAINT "program_elective_groups_identity" UNIQUE("id","program_id"),
	CONSTRAINT "program_elective_groups_min_credits_range" CHECK ("program_elective_groups"."min_credits" BETWEEN 1 AND 60),
	CONSTRAINT "program_elective_groups_name_present" CHECK (length(btrim("program_elective_groups"."name")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE "grade_amendments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"grade_sheet_id" uuid NOT NULL,
	"grade_component_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"component_label" text NOT NULL,
	"old_score" numeric(4, 2),
	"new_score" numeric(4, 2) NOT NULL,
	"reason" text NOT NULL,
	"source" "grade_amendment_source" NOT NULL,
	"request_id" uuid,
	"status" "grade_amendment_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_name" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" uuid,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"result_before" text,
	"result_after" text,
	CONSTRAINT "grade_amendments_score_range" CHECK ("grade_amendments"."new_score" BETWEEN 0 AND 10 AND ("grade_amendments"."old_score" IS NULL OR "grade_amendments"."old_score" BETWEEN 0 AND 10)),
	CONSTRAINT "grade_amendments_changes_score" CHECK ("grade_amendments"."old_score" IS DISTINCT FROM "grade_amendments"."new_score"),
	CONSTRAINT "grade_amendments_reason_present" CHECK (length(btrim("grade_amendments"."reason")) BETWEEN 1 AND 500),
	CONSTRAINT "grade_amendments_decided_fields" CHECK (("grade_amendments"."status" = 'pending') = ("grade_amendments"."decided_at" IS NULL) AND ("grade_amendments"."decided_at" IS NULL) = ("grade_amendments"."decided_by_name" IS NULL) AND ("grade_amendments"."status" = 'approved') = ("grade_amendments"."result_after" IS NOT NULL)),
	CONSTRAINT "grade_amendments_reject_note" CHECK ("grade_amendments"."status" <> 'rejected' OR length(btrim(coalesce("grade_amendments"."decision_note", ''))) > 0),
	CONSTRAINT "grade_amendments_not_self_approved" CHECK ("grade_amendments"."decided_by_user_id" IS NULL OR "grade_amendments"."requested_by_user_id" IS NULL OR "grade_amendments"."decided_by_user_id" <> "grade_amendments"."requested_by_user_id")
);
--> statement-breakpoint
CREATE TABLE "request_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_documents_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "request_documents_size_range" CHECK ("request_documents"."size_bytes" BETWEEN 1 AND 20971520)
);
--> statement-breakpoint
CREATE TABLE "class_session_leaves" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"lab_group_id" uuid,
	"date" date NOT NULL,
	"start_period" smallint NOT NULL,
	"end_period" smallint NOT NULL,
	"reason" text NOT NULL,
	"makeup_note" text DEFAULT '' NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_session_leaves_slot_unique" UNIQUE NULLS NOT DISTINCT("class_section_id","date","start_period","lab_group_id"),
	CONSTRAINT "class_session_leaves_period_range" CHECK ("class_session_leaves"."start_period" >= 1 AND "class_session_leaves"."end_period" <= 12 AND "class_session_leaves"."start_period" <= "class_session_leaves"."end_period"),
	CONSTRAINT "class_session_leaves_reason_present" CHECK (length(btrim("class_session_leaves"."reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "course_results" DROP CONSTRAINT "course_results_letter";--> statement-breakpoint
ALTER TABLE "course_results" DROP CONSTRAINT "course_results_graded_together";--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "is_conditional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "program_courses" ADD COLUMN "elective_group_id" uuid;--> statement-breakpoint
ALTER TABLE "course_results" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_overrides" ADD CONSTRAINT "credit_overrides_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_overrides" ADD CONSTRAINT "credit_overrides_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_overrides" ADD CONSTRAINT "credit_overrides_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_elective_groups" ADD CONSTRAINT "program_elective_groups_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_amendments" ADD CONSTRAINT "grade_amendments_grade_sheet_id_grade_sheets_id_fk" FOREIGN KEY ("grade_sheet_id") REFERENCES "public"."grade_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_amendments" ADD CONSTRAINT "grade_amendments_grade_component_id_grade_components_id_fk" FOREIGN KEY ("grade_component_id") REFERENCES "public"."grade_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_amendments" ADD CONSTRAINT "grade_amendments_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_amendments" ADD CONSTRAINT "grade_amendments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_amendments" ADD CONSTRAINT "grade_amendments_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_amendments" ADD CONSTRAINT "grade_amendments_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_amendments" ADD CONSTRAINT "grade_amendments_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_leaves" ADD CONSTRAINT "class_session_leaves_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_leaves" ADD CONSTRAINT "class_session_leaves_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_leaves" ADD CONSTRAINT "class_session_leaves_lab_group_fk" FOREIGN KEY ("lab_group_id","class_section_id") REFERENCES "public"."lab_groups"("id","class_section_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_overrides_student_id_index" ON "credit_overrides" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "credit_overrides_request_id_index" ON "credit_overrides" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "grade_amendments_grade_sheet_id_status_index" ON "grade_amendments" USING btree ("grade_sheet_id","status");--> statement-breakpoint
CREATE INDEX "grade_amendments_enrollment_id_index" ON "grade_amendments" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "grade_amendments_student_id_index" ON "grade_amendments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "grade_amendments_grade_component_id_index" ON "grade_amendments" USING btree ("grade_component_id");--> statement-breakpoint
CREATE INDEX "grade_amendments_status_requested_at_index" ON "grade_amendments" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "grade_amendments_requested_by_user_id_index" ON "grade_amendments" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "grade_amendments_decided_by_user_id_index" ON "grade_amendments" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grade_amendments_single_pending" ON "grade_amendments" USING btree ("enrollment_id","grade_component_id") WHERE "grade_amendments"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "grade_amendments_request_unique" ON "grade_amendments" USING btree ("request_id") WHERE "grade_amendments"."request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "request_documents_request_id_index" ON "request_documents" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "class_session_leaves_request_id_index" ON "class_session_leaves" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "class_session_leaves_lab_group_id_index" ON "class_session_leaves" USING btree ("lab_group_id");--> statement-breakpoint
ALTER TABLE "program_courses" ADD CONSTRAINT "program_courses_elective_group_fk" FOREIGN KEY ("elective_group_id","program_id") REFERENCES "public"."program_elective_groups"("id","program_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_deferrals" ADD CONSTRAINT "exam_deferrals_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_courses_elective_group_id_index" ON "program_courses" USING btree ("elective_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_deferrals_request_unique" ON "exam_deferrals" USING btree ("request_id") WHERE "exam_deferrals"."request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "course_results_request_id_index" ON "course_results" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_withdrawn_at_matches_status" CHECK (("enrollments"."status"::text = 'withdrawn') = ("enrollments"."withdrawn_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_exemption_mark" CHECK (("course_results"."source" = 'exemption') = ("course_results"."letter" IS NOT DISTINCT FROM 'M'));--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_class_marks" CHECK ("course_results"."letter" IS NULL OR "course_results"."letter" NOT IN ('W', 'I') OR "course_results"."source" = 'class');--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_letter" CHECK ("course_results"."letter" IS NULL OR "course_results"."letter" IN ('A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W', 'I', 'M'));--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_graded_together" CHECK (("course_results"."score10" IS NULL) = ("course_results"."point4" IS NULL) AND ("course_results"."score10" IS NULL) = ("course_results"."letter" IS NULL OR "course_results"."letter" IN ('W', 'I', 'M')));