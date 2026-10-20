CREATE TYPE "public"."appointment_attendance" AS ENUM('present', 'absent');--> statement-breakpoint
CREATE TYPE "public"."exam_swap_decision" AS ENUM('accepted', 'rejected', 'withdrawn');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'survey';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'syllabus';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'advising';--> statement-breakpoint
ALTER TYPE "public"."exam_kind" ADD VALUE 'makeup';--> statement-breakpoint
CREATE TABLE "exam_candidates" (
	"exam_session_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"exam_room_id" uuid NOT NULL,
	"candidate_number" smallint NOT NULL,
	CONSTRAINT "exam_candidates_exam_session_id_enrollment_id_pk" PRIMARY KEY("exam_session_id","enrollment_id"),
	CONSTRAINT "exam_candidates_exam_session_id_candidate_number_unique" UNIQUE("exam_session_id","candidate_number"),
	CONSTRAINT "exam_candidates_number_positive" CHECK ("exam_candidates"."candidate_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "exam_deferrals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"kind" "exam_kind" NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_deferrals_enrollment_id_kind_unique" UNIQUE("enrollment_id","kind"),
	CONSTRAINT "exam_deferrals_kind" CHECK ("exam_deferrals"."kind"::text <> 'makeup'),
	CONSTRAINT "exam_deferrals_reason_present" CHECK (length(btrim("exam_deferrals"."reason")) BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE "exam_session_rooms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"exam_session_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "exam_session_rooms_exam_session_id_room_id_unique" UNIQUE("exam_session_id","room_id"),
	CONSTRAINT "exam_session_rooms_exam_session_id_position_unique" UNIQUE("exam_session_id","position"),
	CONSTRAINT "exam_session_rooms_id_exam_session_id_unique" UNIQUE("id","exam_session_id")
);
--> statement-breakpoint
CREATE TABLE "syllabus_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"version" smallint NOT NULL,
	"assessments" jsonb NOT NULL,
	"note" text NOT NULL,
	"revised_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syllabus_revisions_syllabus_id_version_unique" UNIQUE("syllabus_id","version"),
	CONSTRAINT "syllabus_revisions_note_present" CHECK (length(btrim("syllabus_revisions"."note")) BETWEEN 1 AND 300)
);
--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" DROP CONSTRAINT "exam_eligibility_overrides_enrollment_id_unique";--> statement-breakpoint
ALTER TABLE "exam_sessions" DROP CONSTRAINT "exam_sessions_class_section_id_kind_unique";--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" DROP CONSTRAINT "exam_proctor_swap_requests_proctor_fk";
--> statement-breakpoint
ALTER TABLE "exam_sessions" DROP CONSTRAINT "exam_sessions_room_id_rooms_id_fk";
--> statement-breakpoint
DROP INDEX "exam_sessions_room_id_date_index";--> statement-breakpoint
ALTER TABLE "survey_responses" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "advising_notes" ADD COLUMN "appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "appointment_students" ADD COLUMN "attendance" "appointment_attendance";--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD COLUMN "revoked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD COLUMN "decision" "exam_swap_decision";--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD COLUMN "resolved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD COLUMN "resolve_note" text;--> statement-breakpoint
ALTER TABLE "exam_proctors" ADD COLUMN "exam_room_id" uuid;--> statement-breakpoint
INSERT INTO "exam_session_rooms" ("exam_session_id", "room_id", "position") SELECT "id", "room_id", 1 FROM "exam_sessions";--> statement-breakpoint
UPDATE "exam_proctors" p SET "exam_room_id" = r."id" FROM "exam_session_rooms" r WHERE r."exam_session_id" = p."exam_session_id";--> statement-breakpoint
ALTER TABLE "exam_proctors" ALTER COLUMN "exam_room_id" SET NOT NULL;--> statement-breakpoint
UPDATE "exam_proctor_swap_requests" SET "decision" = 'accepted' WHERE "resolved_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_id_class_section_id_unique" UNIQUE("id","class_section_id");--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "makeup_of_id" uuid;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "sealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "version" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_candidates" ADD CONSTRAINT "exam_candidates_exam_session_id_exam_sessions_id_fk" FOREIGN KEY ("exam_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_candidates" ADD CONSTRAINT "exam_candidates_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_candidates" ADD CONSTRAINT "exam_candidates_room_fk" FOREIGN KEY ("exam_room_id","exam_session_id") REFERENCES "public"."exam_session_rooms"("id","exam_session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_deferrals" ADD CONSTRAINT "exam_deferrals_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_deferrals" ADD CONSTRAINT "exam_deferrals_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_session_rooms" ADD CONSTRAINT "exam_session_rooms_exam_session_id_exam_sessions_id_fk" FOREIGN KEY ("exam_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_session_rooms" ADD CONSTRAINT "exam_session_rooms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_revisions" ADD CONSTRAINT "syllabus_revisions_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_candidates_enrollment_id_index" ON "exam_candidates" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "exam_candidates_exam_room_id_index" ON "exam_candidates" USING btree ("exam_room_id");--> statement-breakpoint
CREATE INDEX "exam_deferrals_decided_by_user_id_index" ON "exam_deferrals" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE INDEX "exam_session_rooms_room_id_index" ON "exam_session_rooms" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "advising_notes" ADD CONSTRAINT "advising_notes_appointment_id_advising_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."advising_appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD CONSTRAINT "exam_eligibility_overrides_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD CONSTRAINT "exam_proctor_swap_requests_exam_session_id_exam_sessions_id_fk" FOREIGN KEY ("exam_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD CONSTRAINT "exam_proctor_swap_requests_requester_id_lecturers_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD CONSTRAINT "exam_proctor_swap_requests_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_proctors" ADD CONSTRAINT "exam_proctors_room_fk" FOREIGN KEY ("exam_room_id","exam_session_id") REFERENCES "public"."exam_session_rooms"("id","exam_session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_makeup_of_fk" FOREIGN KEY ("makeup_of_id","class_section_id") REFERENCES "public"."exam_sessions"("id","class_section_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advising_notes_appointment_id_index" ON "advising_notes" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_eligibility_overrides_enrollment_id_unique" ON "exam_eligibility_overrides" USING btree ("enrollment_id") WHERE "exam_eligibility_overrides"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "exam_eligibility_overrides_revoked_by_user_id_index" ON "exam_eligibility_overrides" USING btree ("revoked_by_user_id");--> statement-breakpoint
CREATE INDEX "exam_proctor_swap_requests_resolved_by_user_id_index" ON "exam_proctor_swap_requests" USING btree ("resolved_by_user_id");--> statement-breakpoint
CREATE INDEX "exam_proctors_exam_room_id_index" ON "exam_proctors" USING btree ("exam_room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_sessions_class_section_id_kind_unique" ON "exam_sessions" USING btree ("class_section_id","kind") WHERE "exam_sessions"."kind" IN ('midterm', 'final');--> statement-breakpoint
CREATE INDEX "surveys_created_by_user_id_index" ON "surveys" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "exam_sessions" DROP COLUMN "room_id";--> statement-breakpoint
ALTER TABLE "survey_submissions" DROP COLUMN "submitted_on";--> statement-breakpoint
ALTER TABLE "advising_notes" ADD CONSTRAINT "advising_notes_content_present" CHECK (length(btrim("advising_notes"."topic")) BETWEEN 1 AND 200 AND length(btrim("advising_notes"."content")) BETWEEN 1 AND 1000);--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD CONSTRAINT "exam_eligibility_overrides_revoke_fields" CHECK (("exam_eligibility_overrides"."revoked_at" IS NULL) = ("exam_eligibility_overrides"."revoke_reason" IS NULL) AND ("exam_eligibility_overrides"."revoked_by_user_id" IS NULL OR "exam_eligibility_overrides"."revoked_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "exam_proctor_swap_requests" ADD CONSTRAINT "exam_proctor_swap_requests_resolved_fields" CHECK (("exam_proctor_swap_requests"."resolved_at" IS NULL) = ("exam_proctor_swap_requests"."decision" IS NULL));--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_makeup_of" CHECK (("exam_sessions"."kind"::text = 'makeup') = ("exam_sessions"."makeup_of_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_paper_deadline_before_exam" CHECK ("exam_sessions"."paper_deadline" < (("exam_sessions"."date" + "exam_sessions"."start_time") AT TIME ZONE 'Asia/Ho_Chi_Minh'));--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_text_present" CHECK (length(btrim("survey_questions"."text")) BETWEEN 1 AND 300 AND length(btrim("survey_questions"."group")) BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_title_present" CHECK (length(btrim("surveys"."title")) BETWEEN 1 AND 200);--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_version_positive" CHECK ("syllabi"."version" >= 1);