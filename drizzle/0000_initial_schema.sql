CREATE TYPE "public"."role_scope" AS ENUM('university', 'faculty');--> statement-breakpoint
CREATE TYPE "public"."appointment_mode" AS ENUM('in-person', 'online');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'done', 'missed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."announcement_category" AS ENUM('registration', 'exam', 'tuition', 'academic', 'event');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'approve', 'reject', 'publish', 'lock', 'assign', 'export', 'sign-in', 'permission');--> statement-breakpoint
CREATE TYPE "public"."audit_entity_type" AS ENUM('student', 'lecturer', 'grade-sheet', 'class-section', 'registration-period', 'request', 'decision', 'announcement', 'role', 'regulation', 'exam');--> statement-breakpoint
CREATE TYPE "public"."class_section_status" AS ENUM('draft', 'open', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('enrolled', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."hold_kind" AS ENUM('tuition', 'discipline', 'documents', 'academic-status', 'advisor');--> statement-breakpoint
CREATE TYPE "public"."registration_event_kind" AS ENUM('add', 'drop', 'swap', 'waitlist', 'waitlist-promoted', 'admin-add', 'admin-drop', 'section-cancelled');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'promoted', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."course_relation_kind" AS ENUM('prerequisite', 'corequisite', 'equivalent');--> statement-breakpoint
CREATE TYPE "public"."course_type" AS ENUM('required', 'elective');--> statement-breakpoint
CREATE TYPE "public"."knowledge_block" AS ENUM('general', 'foundation', 'major', 'internship');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('active', 'draft', 'archived');--> statement-breakpoint
CREATE TYPE "public"."exam_format" AS ENUM('written', 'multiple-choice', 'practical', 'oral', 'project');--> statement-breakpoint
CREATE TYPE "public"."exam_kind" AS ENUM('midterm', 'final');--> statement-breakpoint
CREATE TYPE "public"."exam_paper_status" AS ENUM('not-submitted', 'submitted', 'approved');--> statement-breakpoint
CREATE TYPE "public"."exam_session_status" AS ENUM('draft', 'published', 'done');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('active', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('lecture', 'lab', 'hall', 'seminar');--> statement-breakpoint
CREATE TYPE "public"."course_result_source" AS ENUM('class', 'transfer', 'exemption');--> statement-breakpoint
CREATE TYPE "public"."grade_sheet_status" AS ENUM('draft', 'locked', 'approved', 'published', 'returned');--> statement-breakpoint
CREATE TYPE "public"."warning_status" AS ENUM('new', 'notified', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."graduation_record_status" AS ENUM('pending', 'approved', 'graduated');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('request', 'deadline', 'grade', 'exam', 'announcement', 'advising', 'system');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('overload', 'withdraw', 'open-class', 'regrade', 'exam-postpone', 'reserve', 'transcript', 'credit-transfer', 'grade-change', 'teaching-leave');--> statement-breakpoint
CREATE TYPE "public"."request_step_role" AS ENUM('advisor', 'lecturer', 'faculty', 'academic-office', 'exam-office');--> statement-breakpoint
CREATE TYPE "public"."request_step_status" AS ENUM('waiting', 'pending', 'approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'excused', 'absent');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_kind" AS ENUM('teaching', 'registration', 'exam', 'grading', 'holiday', 'event');--> statement-breakpoint
CREATE TYPE "public"."study_plan_status" AS ENUM('draft', 'pending', 'approved', 'returned');--> statement-breakpoint
CREATE TYPE "public"."class_announcement_status" AS ENUM('published', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."syllabus_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."decision_kind" AS ENUM('reserve', 'resume', 'suspend', 'expel', 'major-change', 'reward', 'discipline', 'graduate');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('draft', 'pending-signature', 'signed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."lecturer_status" AS ENUM('active', 'on-leave');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('studying', 'reserved', 'suspended', 'graduated');--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"faculty_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	CONSTRAINT "role_assignments_userId_roleId_facultyId_unique" UNIQUE NULLS NOT DISTINCT("user_id","role_id","faculty_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"scope" "role_scope" NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "advising_appointments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"advisor_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"mode" "appointment_mode" NOT NULL,
	"location" text NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advising_appointments_duration_range" CHECK ("advising_appointments"."duration_minutes" BETWEEN 5 AND 240)
);
--> statement-breakpoint
CREATE TABLE "advising_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic" text NOT NULL,
	"content" text NOT NULL,
	"follow_up" text
);
--> statement-breakpoint
CREATE TABLE "appointment_students" (
	"appointment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	CONSTRAINT "appointment_students_appointment_id_student_id_pk" PRIMARY KEY("appointment_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" "announcement_category" NOT NULL,
	"audiences" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"deadline" timestamp with time zone,
	"author_user_id" uuid,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_slug_unique" UNIQUE("slug"),
	CONSTRAINT "announcements_slug_format" CHECK ("announcements"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "announcements_published_fields" CHECK ("announcements"."status" = 'draft' OR "announcements"."published_at" IS NOT NULL),
	CONSTRAINT "announcements_view_count_non_negative" CHECK ("announcements"."view_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"entity_label" text NOT NULL,
	"summary" text NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ip" "inet",
	CONSTRAINT "audit_logs_changes_array" CHECK (jsonb_typeof("audit_logs"."changes") = 'array')
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_section_audience_majors" (
	"class_section_id" uuid NOT NULL,
	"major_id" uuid NOT NULL,
	CONSTRAINT "class_section_audience_majors_class_section_id_major_id_pk" PRIMARY KEY("class_section_id","major_id")
);
--> statement-breakpoint
CREATE TABLE "class_sections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"term_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"section_number" smallint NOT NULL,
	"code" text NOT NULL,
	"lecturer_id" uuid,
	"capacity" smallint NOT NULL,
	"enrolled_count" smallint DEFAULT 0 NOT NULL,
	"min_enrollment" smallint DEFAULT 0 NOT NULL,
	"status" "class_section_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"audience_cohorts" smallint[],
	"audience_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_sections_termId_courseId_sectionNumber_unique" UNIQUE("term_id","course_id","section_number"),
	CONSTRAINT "class_sections_termId_code_unique" UNIQUE("term_id","code"),
	CONSTRAINT "class_sections_identity" UNIQUE("id","term_id","course_id"),
	CONSTRAINT "class_sections_capacity_positive" CHECK ("class_sections"."capacity" > 0),
	CONSTRAINT "class_sections_enrolled_within_capacity" CHECK ("class_sections"."enrolled_count" >= 0 AND "class_sections"."enrolled_count" <= "class_sections"."capacity"),
	CONSTRAINT "class_sections_min_enrollment_range" CHECK ("class_sections"."min_enrollment" >= 0 AND "class_sections"."min_enrollment" <= "class_sections"."capacity"),
	CONSTRAINT "class_sections_date_order" CHECK ("class_sections"."start_date" < "class_sections"."end_date")
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_section_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"lab_group_id" uuid,
	"reserved_seat_id" uuid,
	"status" "enrollment_status" DEFAULT 'enrolled' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dropped_at" timestamp with time zone,
	CONSTRAINT "enrollments_dropped_at_matches_status" CHECK (("enrollments"."status" = 'dropped') = ("enrollments"."dropped_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "lab_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"code" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_period" smallint NOT NULL,
	"end_period" smallint NOT NULL,
	"room_id" uuid NOT NULL,
	"capacity" smallint NOT NULL,
	"enrolled_count" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "lab_groups_classSectionId_code_unique" UNIQUE("class_section_id","code"),
	CONSTRAINT "lab_groups_identity" UNIQUE("id","class_section_id"),
	CONSTRAINT "lab_groups_day_of_week" CHECK ("lab_groups"."day_of_week" BETWEEN 2 AND 8),
	CONSTRAINT "lab_groups_period_range" CHECK ("lab_groups"."start_period" >= 1 AND "lab_groups"."end_period" <= 12 AND "lab_groups"."start_period" <= "lab_groups"."end_period"),
	CONSTRAINT "lab_groups_capacity_positive" CHECK ("lab_groups"."capacity" > 0),
	CONSTRAINT "lab_groups_enrolled_within_capacity" CHECK ("lab_groups"."enrolled_count" >= 0 AND "lab_groups"."enrolled_count" <= "lab_groups"."capacity")
);
--> statement-breakpoint
CREATE TABLE "registration_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_section_id" uuid NOT NULL,
	"kind" "registration_event_kind" NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"channel" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_holds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "hold_kind" NOT NULL,
	"blocking" boolean NOT NULL,
	"reason" text NOT NULL,
	"resolve_hint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_by_label" text NOT NULL,
	"released_at" timestamp with time zone,
	"released_by_user_id" uuid,
	"released_by_label" text,
	CONSTRAINT "registration_holds_release_fields" CHECK (("registration_holds"."released_at" IS NULL) = ("registration_holds"."released_by_label" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "registration_periods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"term_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cohorts" smallint[] NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"min_credits" smallint NOT NULL,
	"max_credits" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_periods_has_cohorts" CHECK (cardinality("registration_periods"."cohorts") > 0),
	CONSTRAINT "registration_periods_time_order" CHECK ("registration_periods"."opens_at" < "registration_periods"."closes_at"),
	CONSTRAINT "registration_periods_credit_range" CHECK ("registration_periods"."min_credits" >= 0 AND "registration_periods"."min_credits" <= "registration_periods"."max_credits")
);
--> statement-breakpoint
CREATE TABLE "reserved_seat_majors" (
	"reserved_seat_id" uuid NOT NULL,
	"major_id" uuid NOT NULL,
	CONSTRAINT "reserved_seat_majors_reserved_seat_id_major_id_pk" PRIMARY KEY("reserved_seat_id","major_id")
);
--> statement-breakpoint
CREATE TABLE "reserved_seats" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"label" text NOT NULL,
	"seats" smallint NOT NULL,
	"taken_count" smallint DEFAULT 0 NOT NULL,
	"cohorts" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	CONSTRAINT "reserved_seats_seats_positive" CHECK ("reserved_seats"."seats" > 0),
	CONSTRAINT "reserved_seats_taken_within_seats" CHECK ("reserved_seats"."taken_count" >= 0 AND "reserved_seats"."taken_count" <= "reserved_seats"."seats")
);
--> statement-breakpoint
CREATE TABLE "section_meetings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_period" smallint NOT NULL,
	"end_period" smallint NOT NULL,
	"room_id" uuid NOT NULL,
	CONSTRAINT "section_meetings_day_of_week" CHECK ("section_meetings"."day_of_week" BETWEEN 2 AND 8),
	CONSTRAINT "section_meetings_period_range" CHECK ("section_meetings"."start_period" >= 1 AND "section_meetings"."end_period" <= 12 AND "section_meetings"."start_period" <= "section_meetings"."end_period")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"academic_year" smallint NOT NULL,
	"semester" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_registration_target" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_code_unique" UNIQUE("code"),
	CONSTRAINT "terms_academicYear_semester_unique" UNIQUE("academic_year","semester"),
	CONSTRAINT "terms_semester_range" CHECK ("terms"."semester" BETWEEN 1 AND 3),
	CONSTRAINT "terms_date_order" CHECK ("terms"."start_date" < "terms"."end_date")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_section_id" uuid NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "waitlist_entries_resolved_at_matches_status" CHECK (("waitlist_entries"."status" = 'waiting') = ("waitlist_entries"."resolved_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "course_relations" (
	"course_id" uuid NOT NULL,
	"related_course_id" uuid NOT NULL,
	"kind" "course_relation_kind" NOT NULL,
	CONSTRAINT "course_relations_course_id_kind_related_course_id_pk" PRIMARY KEY("course_id","kind","related_course_id"),
	CONSTRAINT "course_relations_not_self" CHECK ("course_relations"."course_id" <> "course_relations"."related_course_id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"credits" smallint NOT NULL,
	"theory_credits" smallint NOT NULL,
	"practice_credits" smallint NOT NULL,
	"faculty_id" uuid NOT NULL,
	"type" "course_type" NOT NULL,
	"block" "knowledge_block" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_code_unique" UNIQUE("code"),
	CONSTRAINT "courses_credits_positive" CHECK ("courses"."credits" > 0),
	CONSTRAINT "courses_credit_split" CHECK ("courses"."theory_credits" >= 0 AND "courses"."practice_credits" >= 0 AND "courses"."theory_credits" + "courses"."practice_credits" = "courses"."credits")
);
--> statement-breakpoint
CREATE TABLE "faculties" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faculties_code_unique" UNIQUE("code"),
	CONSTRAINT "faculties_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "majors" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"faculty_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "majors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "program_cohorts" (
	"program_id" uuid NOT NULL,
	"cohort" smallint NOT NULL,
	CONSTRAINT "program_cohorts_program_id_cohort_pk" PRIMARY KEY("program_id","cohort")
);
--> statement-breakpoint
CREATE TABLE "program_courses" (
	"program_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"semester" smallint NOT NULL,
	CONSTRAINT "program_courses_program_id_course_id_pk" PRIMARY KEY("program_id","course_id"),
	CONSTRAINT "program_courses_semester_range" CHECK ("program_courses"."semester" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"major_id" uuid NOT NULL,
	"degree" text NOT NULL,
	"total_credits" smallint NOT NULL,
	"duration_years" smallint NOT NULL,
	"status" "program_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_total_credits_positive" CHECK ("programs"."total_credits" > 0),
	CONSTRAINT "programs_duration_range" CHECK ("programs"."duration_years" BETWEEN 1 AND 8)
);
--> statement-breakpoint
CREATE TABLE "exam_eligibility_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_eligibility_overrides_enrollmentId_unique" UNIQUE("enrollment_id")
);
--> statement-breakpoint
CREATE TABLE "exam_proctors" (
	"exam_session_id" uuid NOT NULL,
	"lecturer_id" uuid NOT NULL,
	CONSTRAINT "exam_proctors_exam_session_id_lecturer_id_pk" PRIMARY KEY("exam_session_id","lecturer_id")
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"term_id" uuid NOT NULL,
	"class_section_id" uuid NOT NULL,
	"kind" "exam_kind" NOT NULL,
	"format" "exam_format" NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"room_id" uuid NOT NULL,
	"status" "exam_session_status" DEFAULT 'draft' NOT NULL,
	"paper_status" "exam_paper_status" DEFAULT 'not-submitted' NOT NULL,
	"paper_deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_sessions_classSectionId_kind_unique" UNIQUE("class_section_id","kind"),
	CONSTRAINT "exam_sessions_duration_range" CHECK ("exam_sessions"."duration_minutes" BETWEEN 15 AND 240)
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campus_id" uuid NOT NULL,
	"code" text NOT NULL,
	"building" text NOT NULL,
	"floor" smallint NOT NULL,
	"capacity" smallint NOT NULL,
	"exam_capacity" smallint NOT NULL,
	"type" "room_type" NOT NULL,
	"equipment" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "room_status" DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_campusId_code_unique" UNIQUE("campus_id","code"),
	CONSTRAINT "rooms_capacity_positive" CHECK ("rooms"."capacity" > 0),
	CONSTRAINT "rooms_exam_capacity_range" CHECK ("rooms"."exam_capacity" > 0 AND "rooms"."exam_capacity" <= "rooms"."capacity")
);
--> statement-breakpoint
CREATE TABLE "academic_warnings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"term_gpa4" numeric(3, 2) NOT NULL,
	"cpa4" numeric(3, 2) NOT NULL,
	"failed_credits" smallint NOT NULL,
	"reasons" text[] NOT NULL,
	"status" "warning_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_warnings_studentId_termId_unique" UNIQUE("student_id","term_id"),
	CONSTRAINT "academic_warnings_level_range" CHECK ("academic_warnings"."level" BETWEEN 1 AND 3),
	CONSTRAINT "academic_warnings_has_reason" CHECK (cardinality("academic_warnings"."reasons") > 0)
);
--> statement-breakpoint
CREATE TABLE "course_results" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"source" "course_result_source" DEFAULT 'class' NOT NULL,
	"score10" numeric(4, 2),
	"letter" text,
	"point4" numeric(3, 2),
	"note" text DEFAULT '' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_results_enrollmentId_unique" UNIQUE("enrollment_id"),
	CONSTRAINT "course_results_score_range" CHECK ("course_results"."score10" IS NULL OR "course_results"."score10" BETWEEN 0 AND 10),
	CONSTRAINT "course_results_point_range" CHECK ("course_results"."point4" IS NULL OR "course_results"."point4" BETWEEN 0 AND 4),
	CONSTRAINT "course_results_letter" CHECK ("course_results"."letter" IS NULL OR "course_results"."letter" IN ('A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F')),
	CONSTRAINT "course_results_class_has_enrollment" CHECK ("course_results"."source" <> 'class' OR "course_results"."enrollment_id" IS NOT NULL),
	CONSTRAINT "course_results_graded_together" CHECK (("course_results"."score10" IS NULL) = ("course_results"."letter" IS NULL) AND ("course_results"."letter" IS NULL) = ("course_results"."point4" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "grade_components" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"grade_sheet_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"weight" smallint NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "grade_components_gradeSheetId_key_unique" UNIQUE("grade_sheet_id","key"),
	CONSTRAINT "grade_components_gradeSheetId_position_unique" UNIQUE("grade_sheet_id","position"),
	CONSTRAINT "grade_components_weight_range" CHECK ("grade_components"."weight" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "grade_scores" (
	"grade_component_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"score" numeric(4, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_scores_grade_component_id_enrollment_id_pk" PRIMARY KEY("grade_component_id","enrollment_id"),
	CONSTRAINT "grade_scores_range" CHECK ("grade_scores"."score" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE TABLE "grade_sheets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"status" "grade_sheet_status" DEFAULT 'draft' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"saved_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"return_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_sheets_classSectionId_unique" UNIQUE("class_section_id"),
	CONSTRAINT "grade_sheets_locked_after_draft" CHECK ("grade_sheets"."status" IN ('draft', 'returned') OR "grade_sheets"."locked_at" IS NOT NULL),
	CONSTRAINT "grade_sheets_published_fields" CHECK (("grade_sheets"."status" = 'published') = ("grade_sheets"."published_at" IS NOT NULL)),
	CONSTRAINT "grade_sheets_return_reason" CHECK ("grade_sheets"."status" <> 'returned' OR "grade_sheets"."return_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "graduation_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"language_certificate" text,
	"it_certificate" text,
	"status" "graduation_record_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graduation_records_studentId_unique" UNIQUE("student_id"),
	CONSTRAINT "graduation_records_decisionId_unique" UNIQUE("decision_id"),
	CONSTRAINT "graduation_records_decided_fields" CHECK (("graduation_records"."status" = 'pending') = ("graduation_records"."decided_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "academic_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"kind" "request_kind" NOT NULL,
	"requester_student_id" uuid,
	"requester_lecturer_id" uuid,
	"faculty_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "academic_requests_code_unique" UNIQUE("code"),
	CONSTRAINT "academic_requests_single_requester" CHECK (num_nonnulls("academic_requests"."requester_student_id", "academic_requests"."requester_lecturer_id") = 1),
	CONSTRAINT "academic_requests_details_array" CHECK (jsonb_typeof("academic_requests"."details") = 'array')
);
--> statement-breakpoint
CREATE TABLE "request_attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"request_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_attachments_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "request_attachments_size_range" CHECK ("request_attachments"."size_bytes" BETWEEN 1 AND 10485760)
);
--> statement-breakpoint
CREATE TABLE "request_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"request_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"role" "request_step_role" NOT NULL,
	"label" text NOT NULL,
	"assignee_user_id" uuid,
	"status" "request_step_status" DEFAULT 'waiting' NOT NULL,
	"due_at" timestamp with time zone,
	"actor_user_id" uuid,
	"acted_at" timestamp with time zone,
	"comment" text,
	CONSTRAINT "request_steps_requestId_position_unique" UNIQUE("request_id","position"),
	CONSTRAINT "request_steps_position_positive" CHECK ("request_steps"."position" >= 1),
	CONSTRAINT "request_steps_acted_fields" CHECK (("request_steps"."status" IN ('approved', 'rejected')) = ("request_steps"."acted_at" IS NOT NULL)),
	CONSTRAINT "request_steps_reject_comment" CHECK ("request_steps"."status" <> 'rejected' OR "request_steps"."comment" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"class_session_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_class_session_id_enrollment_id_pk" PRIMARY KEY("class_session_id","enrollment_id")
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_period" smallint NOT NULL,
	"end_period" smallint NOT NULL,
	"room_id" uuid NOT NULL,
	"taken_at" timestamp with time zone,
	CONSTRAINT "class_sessions_classSectionId_date_startPeriod_unique" UNIQUE("class_section_id","date","start_period"),
	CONSTRAINT "class_sessions_period_range" CHECK ("class_sessions"."start_period" >= 1 AND "class_sessions"."end_period" <= 12 AND "class_sessions"."start_period" <= "class_sessions"."end_period")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"term_id" uuid NOT NULL,
	"kind" "calendar_event_kind" NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"audience" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_date_order" CHECK ("calendar_events"."start_date" <= "calendar_events"."end_date")
);
--> statement-breakpoint
CREATE TABLE "regulations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"version" text NOT NULL,
	"effective_from" date NOT NULL,
	"decision" text NOT NULL,
	"summary" text NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "regulations_version_unique" UNIQUE("version"),
	CONSTRAINT "regulations_effectiveFrom_unique" UNIQUE("effective_from"),
	CONSTRAINT "regulations_rules_object" CHECK (jsonb_typeof("regulations"."rules") = 'object' AND "regulations"."rules" ?& array['grading', 'credits', 'warning', 'attendance', 'workflow'])
);
--> statement-breakpoint
CREATE TABLE "study_plan_items" (
	"study_plan_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"academic_year" smallint NOT NULL,
	"semester" smallint NOT NULL,
	CONSTRAINT "study_plan_items_study_plan_id_course_id_pk" PRIMARY KEY("study_plan_id","course_id"),
	CONSTRAINT "study_plan_items_semester_range" CHECK ("study_plan_items"."semester" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "study_plan_status" DEFAULT 'draft' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"student_note" text DEFAULT '' NOT NULL,
	"advisor_comment" text,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plans_submitted_fields" CHECK ("study_plans"."status" = 'draft' OR "study_plans"."submitted_at" IS NOT NULL),
	CONSTRAINT "study_plans_reviewed_fields" CHECK (("study_plans"."status" IN ('approved', 'returned')) = ("study_plans"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "study_plans_return_comment" CHECK ("study_plans"."status" <> 'returned' OR "study_plans"."advisor_comment" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "survey_answers" (
	"response_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	CONSTRAINT "survey_answers_response_id_question_id_pk" PRIMARY KEY("response_id","question_id"),
	CONSTRAINT "survey_answers_score_range" CHECK ("survey_answers"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "survey_questions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"survey_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"group" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "survey_questions_surveyId_position_unique" UNIQUE("survey_id","position")
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"survey_id" uuid NOT NULL,
	"class_section_id" uuid NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "survey_submissions" (
	"survey_id" uuid NOT NULL,
	"class_section_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"submitted_on" date DEFAULT now() NOT NULL,
	CONSTRAINT "survey_submissions_survey_id_class_section_id_student_id_pk" PRIMARY KEY("survey_id","class_section_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"term_id" uuid NOT NULL,
	"title" text NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_time_order" CHECK ("surveys"."opens_at" < "surveys"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "class_announcement_reads" (
	"class_announcement_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_announcement_reads_class_announcement_id_student_id_pk" PRIMARY KEY("class_announcement_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "class_announcements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"send_email" boolean DEFAULT false NOT NULL,
	"status" "class_announcement_status" DEFAULT 'published' NOT NULL,
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabi" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_section_id" uuid NOT NULL,
	"status" "syllabus_status" DEFAULT 'draft' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"references" text[] DEFAULT '{}'::text[] NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syllabi_classSectionId_unique" UNIQUE("class_section_id"),
	CONSTRAINT "syllabi_published_fields" CHECK (("syllabi"."status" = 'published') = ("syllabi"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "syllabus_assessments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"weight" smallint NOT NULL,
	"method" text NOT NULL,
	"outcome_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "syllabus_assessments_syllabusId_key_unique" UNIQUE("syllabus_id","key"),
	CONSTRAINT "syllabus_assessments_syllabusId_position_unique" UNIQUE("syllabus_id","position"),
	CONSTRAINT "syllabus_assessments_weight_range" CHECK ("syllabus_assessments"."weight" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "syllabus_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"code" text NOT NULL,
	"text" text NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "syllabus_outcomes_syllabusId_code_unique" UNIQUE("syllabus_id","code"),
	CONSTRAINT "syllabus_outcomes_syllabusId_position_unique" UNIQUE("syllabus_id","position")
);
--> statement-breakpoint
CREATE TABLE "syllabus_weeks" (
	"syllabus_id" uuid NOT NULL,
	"week" smallint NOT NULL,
	"topic" text NOT NULL,
	"activities" text DEFAULT '' NOT NULL,
	"readings" text DEFAULT '' NOT NULL,
	CONSTRAINT "syllabus_weeks_syllabus_id_week_pk" PRIMARY KEY("syllabus_id","week"),
	CONSTRAINT "syllabus_weeks_week_range" CHECK ("syllabus_weeks"."week" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"label" text NOT NULL,
	"quantity" smallint NOT NULL,
	"unit_price" numeric(14, 0) NOT NULL,
	"amount" numeric(14, 0) GENERATED ALWAYS AS (quantity * unit_price) STORED NOT NULL,
	CONSTRAINT "invoice_lines_invoiceId_position_unique" UNIQUE("invoice_id","position"),
	CONSTRAINT "invoice_lines_quantity_positive" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_unit_price_non_negative" CHECK ("invoice_lines"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"amount" numeric(14, 0) NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "tuition_invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"discount" numeric(14, 0) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_invoices_studentId_termId_unique" UNIQUE("student_id","term_id"),
	CONSTRAINT "tuition_invoices_discount_non_negative" CHECK ("tuition_invoices"."discount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "administrative_classes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"major_id" uuid NOT NULL,
	"cohort" smallint NOT NULL,
	"advisor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "administrative_classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lecturers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"title" text NOT NULL,
	"gender" "gender" NOT NULL,
	"faculty_id" uuid NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"status" "lecturer_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lecturers_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "lecturers_code_unique" UNIQUE("code"),
	CONSTRAINT "lecturers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"unit" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "staff_members_code_unique" UNIQUE("code"),
	CONSTRAINT "staff_members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "student_decisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"number" text,
	"kind" "decision_kind" NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"basis" text NOT NULL,
	"effective_date" date NOT NULL,
	"status" "decision_status" DEFAULT 'draft' NOT NULL,
	"signed_by" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_decisions_signed_fields" CHECK (("student_decisions"."status" IN ('signed', 'revoked')) = ("student_decisions"."number" IS NOT NULL AND "student_decisions"."signed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"gender" "gender" NOT NULL,
	"date_of_birth" date NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"hometown" text DEFAULT '' NOT NULL,
	"administrative_class_id" uuid NOT NULL,
	"status" "student_status" DEFAULT 'studying' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "students_code_unique" UNIQUE("code"),
	CONSTRAINT "students_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advising_appointments" ADD CONSTRAINT "advising_appointments_advisor_id_lecturers_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."lecturers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advising_notes" ADD CONSTRAINT "advising_notes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advising_notes" ADD CONSTRAINT "advising_notes_author_id_lecturers_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_students" ADD CONSTRAINT "appointment_students_appointment_id_advising_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."advising_appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_students" ADD CONSTRAINT "appointment_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_section_audience_majors" ADD CONSTRAINT "class_section_audience_majors_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_section_audience_majors" ADD CONSTRAINT "class_section_audience_majors_section_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_lecturer_id_lecturers_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."lecturers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_reserved_seat_id_reserved_seats_id_fk" FOREIGN KEY ("reserved_seat_id") REFERENCES "public"."reserved_seats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_section_fk" FOREIGN KEY ("class_section_id","term_id","course_id") REFERENCES "public"."class_sections"("id","term_id","course_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_lab_group_fk" FOREIGN KEY ("lab_group_id","class_section_id") REFERENCES "public"."lab_groups"("id","class_section_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_groups" ADD CONSTRAINT "lab_groups_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_groups" ADD CONSTRAINT "lab_groups_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_holds" ADD CONSTRAINT "registration_holds_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_holds" ADD CONSTRAINT "registration_holds_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_holds" ADD CONSTRAINT "registration_holds_released_by_user_id_user_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_periods" ADD CONSTRAINT "registration_periods_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserved_seat_majors" ADD CONSTRAINT "reserved_seat_majors_reserved_seat_id_reserved_seats_id_fk" FOREIGN KEY ("reserved_seat_id") REFERENCES "public"."reserved_seats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserved_seat_majors" ADD CONSTRAINT "reserved_seat_majors_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserved_seats" ADD CONSTRAINT "reserved_seats_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_meetings" ADD CONSTRAINT "section_meetings_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_meetings" ADD CONSTRAINT "section_meetings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_relations" ADD CONSTRAINT "course_relations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_relations" ADD CONSTRAINT "course_relations_related_course_id_courses_id_fk" FOREIGN KEY ("related_course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "majors" ADD CONSTRAINT "majors_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_cohorts" ADD CONSTRAINT "program_cohorts_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_courses" ADD CONSTRAINT "program_courses_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_courses" ADD CONSTRAINT "program_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD CONSTRAINT "exam_eligibility_overrides_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_overrides" ADD CONSTRAINT "exam_eligibility_overrides_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_proctors" ADD CONSTRAINT "exam_proctors_exam_session_id_exam_sessions_id_fk" FOREIGN KEY ("exam_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_proctors" ADD CONSTRAINT "exam_proctors_lecturer_id_lecturers_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_warnings" ADD CONSTRAINT "academic_warnings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_warnings" ADD CONSTRAINT "academic_warnings_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_components" ADD CONSTRAINT "grade_components_grade_sheet_id_grade_sheets_id_fk" FOREIGN KEY ("grade_sheet_id") REFERENCES "public"."grade_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scores" ADD CONSTRAINT "grade_scores_grade_component_id_grade_components_id_fk" FOREIGN KEY ("grade_component_id") REFERENCES "public"."grade_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scores" ADD CONSTRAINT "grade_scores_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_sheets" ADD CONSTRAINT "grade_sheets_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_sheets" ADD CONSTRAINT "grade_sheets_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_sheets" ADD CONSTRAINT "grade_sheets_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_decision_id_student_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."student_decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_requests" ADD CONSTRAINT "academic_requests_requester_student_id_students_id_fk" FOREIGN KEY ("requester_student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_requests" ADD CONSTRAINT "academic_requests_requester_lecturer_id_lecturers_id_fk" FOREIGN KEY ("requester_lecturer_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_requests" ADD CONSTRAINT "academic_requests_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_request_id_academic_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."academic_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulations" ADD CONSTRAINT "regulations_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_study_plan_id_study_plans_id_fk" FOREIGN KEY ("study_plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_reviewed_by_id_lecturers_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."lecturers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_response_id_survey_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_question_id_survey_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_submissions" ADD CONSTRAINT "survey_submissions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_submissions" ADD CONSTRAINT "survey_submissions_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_submissions" ADD CONSTRAINT "survey_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_announcement_reads" ADD CONSTRAINT "class_announcement_reads_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_announcement_reads" ADD CONSTRAINT "class_announcement_reads_announcement_fk" FOREIGN KEY ("class_announcement_id") REFERENCES "public"."class_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD CONSTRAINT "class_announcements_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD CONSTRAINT "class_announcements_author_id_lecturers_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_assessments" ADD CONSTRAINT "syllabus_assessments_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_outcomes" ADD CONSTRAINT "syllabus_outcomes_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_weeks" ADD CONSTRAINT "syllabus_weeks_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_tuition_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tuition_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_tuition_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tuition_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_classes" ADD CONSTRAINT "administrative_classes_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_classes" ADD CONSTRAINT "administrative_classes_advisor_id_lecturers_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."lecturers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_administrative_class_id_administrative_classes_id_fk" FOREIGN KEY ("administrative_class_id") REFERENCES "public"."administrative_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_assignments_role_id_index" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_assignments_faculty_id_index" ON "role_assignments" USING btree ("faculty_id");--> statement-breakpoint
CREATE INDEX "role_assignments_granted_by_user_id_index" ON "role_assignments" USING btree ("granted_by_user_id");--> statement-breakpoint
CREATE INDEX "advising_appointments_advisor_id_date_index" ON "advising_appointments" USING btree ("advisor_id","date");--> statement-breakpoint
CREATE INDEX "advising_notes_student_id_at_index" ON "advising_notes" USING btree ("student_id","at");--> statement-breakpoint
CREATE INDEX "advising_notes_author_id_index" ON "advising_notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "appointment_students_student_id_index" ON "appointment_students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "announcements_status_published_at_index" ON "announcements" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "announcements_author_user_id_index" ON "announcements" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_at_index" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_type_entity_id_index" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_at_index" ON "audit_logs" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "class_section_audience_majors_major_id_index" ON "class_section_audience_majors" USING btree ("major_id");--> statement-breakpoint
CREATE INDEX "class_sections_course_id_index" ON "class_sections" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "class_sections_lecturer_id_index" ON "class_sections" USING btree ("lecturer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_active_per_section" ON "enrollments" USING btree ("student_id","class_section_id") WHERE "enrollments"."status" = 'enrolled';--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_active_per_course_term" ON "enrollments" USING btree ("student_id","term_id","course_id") WHERE "enrollments"."status" = 'enrolled';--> statement-breakpoint
CREATE INDEX "enrollments_class_section_id_status_index" ON "enrollments" USING btree ("class_section_id","status");--> statement-breakpoint
CREATE INDEX "enrollments_student_id_term_id_index" ON "enrollments" USING btree ("student_id","term_id");--> statement-breakpoint
CREATE INDEX "enrollments_lab_group_id_index" ON "enrollments" USING btree ("lab_group_id");--> statement-breakpoint
CREATE INDEX "lab_groups_room_id_day_of_week_index" ON "lab_groups" USING btree ("room_id","day_of_week");--> statement-breakpoint
CREATE INDEX "registration_events_student_id_at_index" ON "registration_events" USING btree ("student_id","at");--> statement-breakpoint
CREATE INDEX "registration_events_class_section_id_index" ON "registration_events" USING btree ("class_section_id");--> statement-breakpoint
CREATE INDEX "registration_events_actor_user_id_index" ON "registration_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_holds_single_active" ON "registration_holds" USING btree ("student_id","kind") WHERE "registration_holds"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "registration_holds_created_by_user_id_index" ON "registration_holds" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "registration_holds_released_by_user_id_index" ON "registration_holds" USING btree ("released_by_user_id");--> statement-breakpoint
CREATE INDEX "registration_periods_term_id_index" ON "registration_periods" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "reserved_seat_majors_major_id_index" ON "reserved_seat_majors" USING btree ("major_id");--> statement-breakpoint
CREATE INDEX "reserved_seats_class_section_id_index" ON "reserved_seats" USING btree ("class_section_id");--> statement-breakpoint
CREATE INDEX "section_meetings_class_section_id_index" ON "section_meetings" USING btree ("class_section_id");--> statement-breakpoint
CREATE INDEX "section_meetings_room_id_day_of_week_index" ON "section_meetings" USING btree ("room_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_single_current" ON "terms" USING btree ("is_current") WHERE "terms"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "terms_single_registration_target" ON "terms" USING btree ("is_registration_target") WHERE "terms"."is_registration_target";--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_single_waiting" ON "waitlist_entries" USING btree ("student_id","class_section_id") WHERE "waitlist_entries"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "waitlist_entries_queue" ON "waitlist_entries" USING btree ("class_section_id","created_at") WHERE "waitlist_entries"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "course_relations_related_course_id_index" ON "course_relations" USING btree ("related_course_id");--> statement-breakpoint
CREATE INDEX "courses_faculty_id_index" ON "courses" USING btree ("faculty_id");--> statement-breakpoint
CREATE INDEX "majors_faculty_id_index" ON "majors" USING btree ("faculty_id");--> statement-breakpoint
CREATE INDEX "program_cohorts_cohort_index" ON "program_cohorts" USING btree ("cohort");--> statement-breakpoint
CREATE INDEX "program_courses_course_id_index" ON "program_courses" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "programs_major_id_index" ON "programs" USING btree ("major_id");--> statement-breakpoint
CREATE INDEX "exam_eligibility_overrides_decided_by_user_id_index" ON "exam_eligibility_overrides" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE INDEX "exam_proctors_lecturer_id_index" ON "exam_proctors" USING btree ("lecturer_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_term_id_date_index" ON "exam_sessions" USING btree ("term_id","date");--> statement-breakpoint
CREATE INDEX "exam_sessions_room_id_date_index" ON "exam_sessions" USING btree ("room_id","date");--> statement-breakpoint
CREATE INDEX "rooms_campus_id_index" ON "rooms" USING btree ("campus_id");--> statement-breakpoint
CREATE INDEX "academic_warnings_term_id_level_index" ON "academic_warnings" USING btree ("term_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "course_results_student_id_course_id_term_id_index" ON "course_results" USING btree ("student_id","course_id","term_id");--> statement-breakpoint
CREATE INDEX "course_results_course_id_index" ON "course_results" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_results_term_id_index" ON "course_results" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "grade_scores_enrollment_id_index" ON "grade_scores" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "grade_sheets_status_deadline_index" ON "grade_sheets" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "grade_sheets_approved_by_user_id_index" ON "grade_sheets" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "grade_sheets_published_by_user_id_index" ON "grade_sheets" USING btree ("published_by_user_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_user_id_created_at_index" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread" ON "notifications" USING btree ("recipient_user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "academic_requests_requester_student_id_created_at_index" ON "academic_requests" USING btree ("requester_student_id","created_at");--> statement-breakpoint
CREATE INDEX "academic_requests_requester_lecturer_id_created_at_index" ON "academic_requests" USING btree ("requester_lecturer_id","created_at");--> statement-breakpoint
CREATE INDEX "academic_requests_faculty_id_created_at_index" ON "academic_requests" USING btree ("faculty_id","created_at");--> statement-breakpoint
CREATE INDEX "request_attachments_request_id_index" ON "request_attachments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_steps_assignee_user_id_status_index" ON "request_steps" USING btree ("assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "request_steps_actor_user_id_index" ON "request_steps" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "attendance_records_enrollment_id_index" ON "attendance_records" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "class_sessions_room_id_date_index" ON "class_sessions" USING btree ("room_id","date");--> statement-breakpoint
CREATE INDEX "calendar_events_term_id_start_date_index" ON "calendar_events" USING btree ("term_id","start_date");--> statement-breakpoint
CREATE INDEX "regulations_created_by_user_id_index" ON "regulations" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "study_plan_items_course_id_index" ON "study_plan_items" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_plans_single_active" ON "study_plans" USING btree ("student_id") WHERE "study_plans"."is_active";--> statement-breakpoint
CREATE INDEX "study_plans_status_index" ON "study_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "study_plans_reviewed_by_id_index" ON "study_plans" USING btree ("reviewed_by_id");--> statement-breakpoint
CREATE INDEX "survey_answers_question_id_index" ON "survey_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "survey_responses_survey_id_class_section_id_index" ON "survey_responses" USING btree ("survey_id","class_section_id");--> statement-breakpoint
CREATE INDEX "survey_responses_class_section_id_index" ON "survey_responses" USING btree ("class_section_id");--> statement-breakpoint
CREATE INDEX "survey_submissions_class_section_id_index" ON "survey_submissions" USING btree ("class_section_id");--> statement-breakpoint
CREATE INDEX "survey_submissions_student_id_index" ON "survey_submissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "surveys_term_id_index" ON "surveys" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "class_announcement_reads_student_id_index" ON "class_announcement_reads" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "class_announcements_class_section_id_publish_at_index" ON "class_announcements" USING btree ("class_section_id","publish_at");--> statement-breakpoint
CREATE INDEX "class_announcements_author_id_index" ON "class_announcements" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_paid_at_index" ON "payments" USING btree ("invoice_id","paid_at");--> statement-breakpoint
CREATE INDEX "tuition_invoices_term_id_due_date_index" ON "tuition_invoices" USING btree ("term_id","due_date");--> statement-breakpoint
CREATE INDEX "administrative_classes_major_id_cohort_index" ON "administrative_classes" USING btree ("major_id","cohort");--> statement-breakpoint
CREATE INDEX "administrative_classes_advisor_id_index" ON "administrative_classes" USING btree ("advisor_id");--> statement-breakpoint
CREATE INDEX "lecturers_faculty_id_index" ON "lecturers" USING btree ("faculty_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_decisions_number_index" ON "student_decisions" USING btree ("number");--> statement-breakpoint
CREATE INDEX "student_decisions_student_id_index" ON "student_decisions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "students_administrative_class_id_index" ON "students" USING btree ("administrative_class_id");--> statement-breakpoint
CREATE INDEX "students_status_index" ON "students" USING btree ("status");