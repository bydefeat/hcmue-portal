CREATE TYPE "public"."report_export_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "report_exports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"report_key" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "report_export_status" DEFAULT 'queued' NOT NULL,
	"requested_by_user_id" uuid,
	"row_count" integer,
	"storage_key" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "report_exports_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "report_exports_params_object" CHECK (jsonb_typeof("report_exports"."params") = 'object'),
	CONSTRAINT "report_exports_done_fields" CHECK (("report_exports"."status" = 'done') = ("report_exports"."storage_key" IS NOT NULL AND "report_exports"."row_count" IS NOT NULL)),
	CONSTRAINT "report_exports_failed_message" CHECK ("report_exports"."status" <> 'failed' OR "report_exports"."error_message" IS NOT NULL),
	CONSTRAINT "report_exports_finished_fields" CHECK (("report_exports"."status" IN ('done', 'failed')) = ("report_exports"."finished_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "tuition_fees" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"academic_year" smallint NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 0) NOT NULL,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_fees_academic_year_code_unique" UNIQUE("academic_year","code"),
	CONSTRAINT "tuition_fees_amount_non_negative" CHECK ("tuition_fees"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tuition_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"academic_year" smallint NOT NULL,
	"major_id" uuid NOT NULL,
	"price_per_credit" numeric(14, 0) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_rates_academic_year_major_id_unique" UNIQUE("academic_year","major_id"),
	CONSTRAINT "tuition_rates_price_non_negative" CHECK ("tuition_rates"."price_per_credit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lecturer_load_norms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"norm_hours" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecturer_load_norms_title_unique" UNIQUE("title"),
	CONSTRAINT "lecturer_load_norms_hours_positive" CHECK ("lecturer_load_norms"."norm_hours" > 0)
);
--> statement-breakpoint
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_userId_roleId_facultyId_unique";--> statement-breakpoint
ALTER TABLE "class_sections" DROP CONSTRAINT "class_sections_termId_courseId_sectionNumber_unique";--> statement-breakpoint
ALTER TABLE "class_sections" DROP CONSTRAINT "class_sections_termId_code_unique";--> statement-breakpoint
ALTER TABLE "lab_groups" DROP CONSTRAINT "lab_groups_classSectionId_code_unique";--> statement-breakpoint
ALTER TABLE "terms" DROP CONSTRAINT "terms_academicYear_semester_unique";--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" DROP CONSTRAINT "exam_eligibility_overrides_enrollmentId_unique";--> statement-breakpoint
ALTER TABLE "exam_sessions" DROP CONSTRAINT "exam_sessions_classSectionId_kind_unique";--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_campusId_code_unique";--> statement-breakpoint
ALTER TABLE "academic_warnings" DROP CONSTRAINT "academic_warnings_studentId_termId_unique";--> statement-breakpoint
ALTER TABLE "course_results" DROP CONSTRAINT "course_results_enrollmentId_unique";--> statement-breakpoint
ALTER TABLE "grade_components" DROP CONSTRAINT "grade_components_gradeSheetId_key_unique";--> statement-breakpoint
ALTER TABLE "grade_components" DROP CONSTRAINT "grade_components_gradeSheetId_position_unique";--> statement-breakpoint
ALTER TABLE "grade_sheets" DROP CONSTRAINT "grade_sheets_classSectionId_unique";--> statement-breakpoint
ALTER TABLE "graduation_records" DROP CONSTRAINT "graduation_records_studentId_unique";--> statement-breakpoint
ALTER TABLE "graduation_records" DROP CONSTRAINT "graduation_records_decisionId_unique";--> statement-breakpoint
ALTER TABLE "request_attachments" DROP CONSTRAINT "request_attachments_storageKey_unique";--> statement-breakpoint
ALTER TABLE "request_steps" DROP CONSTRAINT "request_steps_requestId_position_unique";--> statement-breakpoint
ALTER TABLE "class_sessions" DROP CONSTRAINT "class_sessions_classSectionId_date_startPeriod_unique";--> statement-breakpoint
ALTER TABLE "regulations" DROP CONSTRAINT "regulations_effectiveFrom_unique";--> statement-breakpoint
ALTER TABLE "survey_questions" DROP CONSTRAINT "survey_questions_surveyId_position_unique";--> statement-breakpoint
ALTER TABLE "syllabi" DROP CONSTRAINT "syllabi_classSectionId_unique";--> statement-breakpoint
ALTER TABLE "syllabus_assessments" DROP CONSTRAINT "syllabus_assessments_syllabusId_key_unique";--> statement-breakpoint
ALTER TABLE "syllabus_assessments" DROP CONSTRAINT "syllabus_assessments_syllabusId_position_unique";--> statement-breakpoint
ALTER TABLE "syllabus_outcomes" DROP CONSTRAINT "syllabus_outcomes_syllabusId_code_unique";--> statement-breakpoint
ALTER TABLE "syllabus_outcomes" DROP CONSTRAINT "syllabus_outcomes_syllabusId_position_unique";--> statement-breakpoint
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_invoiceId_position_unique";--> statement-breakpoint
ALTER TABLE "tuition_invoices" DROP CONSTRAINT "tuition_invoices_studentId_termId_unique";--> statement-breakpoint
ALTER TABLE "lecturers" DROP CONSTRAINT "lecturers_userId_unique";--> statement-breakpoint
ALTER TABLE "staff_members" DROP CONSTRAINT "staff_members_userId_unique";--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_userId_unique";--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "paper_storage_key" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "paper_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_rates" ADD CONSTRAINT "tuition_rates_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_exports_requested_by_user_id_created_at_index" ON "report_exports" USING btree ("requested_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "report_exports_status_index" ON "report_exports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tuition_rates_major_id_index" ON "tuition_rates" USING btree ("major_id");--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_role_id_faculty_id_unique" UNIQUE NULLS NOT DISTINCT("user_id","role_id","faculty_id");--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_term_id_course_id_section_number_unique" UNIQUE("term_id","course_id","section_number");--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_term_id_code_unique" UNIQUE("term_id","code");--> statement-breakpoint
ALTER TABLE "lab_groups" ADD CONSTRAINT "lab_groups_class_section_id_code_unique" UNIQUE("class_section_id","code");--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_academic_year_semester_unique" UNIQUE("academic_year","semester");--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD CONSTRAINT "exam_eligibility_overrides_enrollment_id_unique" UNIQUE("enrollment_id");--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_paper_storage_key_unique" UNIQUE("paper_storage_key");--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_class_section_id_kind_unique" UNIQUE("class_section_id","kind");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campus_id_code_unique" UNIQUE("campus_id","code");--> statement-breakpoint
ALTER TABLE "academic_warnings" ADD CONSTRAINT "academic_warnings_student_id_term_id_unique" UNIQUE("student_id","term_id");--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_enrollment_id_unique" UNIQUE("enrollment_id");--> statement-breakpoint
ALTER TABLE "grade_components" ADD CONSTRAINT "grade_components_grade_sheet_id_key_unique" UNIQUE("grade_sheet_id","key");--> statement-breakpoint
ALTER TABLE "grade_components" ADD CONSTRAINT "grade_components_grade_sheet_id_position_unique" UNIQUE("grade_sheet_id","position");--> statement-breakpoint
ALTER TABLE "grade_sheets" ADD CONSTRAINT "grade_sheets_class_section_id_unique" UNIQUE("class_section_id");--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_student_id_unique" UNIQUE("student_id");--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_decision_id_unique" UNIQUE("decision_id");--> statement-breakpoint
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_storage_key_unique" UNIQUE("storage_key");--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_request_id_position_unique" UNIQUE("request_id","position");--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_section_id_date_start_period_unique" UNIQUE("class_section_id","date","start_period");--> statement-breakpoint
ALTER TABLE "regulations" ADD CONSTRAINT "regulations_effective_from_unique" UNIQUE("effective_from");--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_position_unique" UNIQUE("survey_id","position");--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_class_section_id_unique" UNIQUE("class_section_id");--> statement-breakpoint
ALTER TABLE "syllabus_assessments" ADD CONSTRAINT "syllabus_assessments_syllabus_id_key_unique" UNIQUE("syllabus_id","key");--> statement-breakpoint
ALTER TABLE "syllabus_assessments" ADD CONSTRAINT "syllabus_assessments_syllabus_id_position_unique" UNIQUE("syllabus_id","position");--> statement-breakpoint
ALTER TABLE "syllabus_outcomes" ADD CONSTRAINT "syllabus_outcomes_syllabus_id_code_unique" UNIQUE("syllabus_id","code");--> statement-breakpoint
ALTER TABLE "syllabus_outcomes" ADD CONSTRAINT "syllabus_outcomes_syllabus_id_position_unique" UNIQUE("syllabus_id","position");--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_position_unique" UNIQUE("invoice_id","position");--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_student_id_term_id_unique" UNIQUE("student_id","term_id");--> statement-breakpoint
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_paper_fields" CHECK (("exam_sessions"."paper_status" = 'not-submitted') = ("exam_sessions"."paper_storage_key" IS NULL AND "exam_sessions"."paper_submitted_at" IS NULL));