CREATE TABLE "request_code_counters" (
	"prefix" text NOT NULL,
	"year" smallint NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "request_code_counters_prefix_year_pk" PRIMARY KEY("prefix","year"),
	CONSTRAINT "request_code_counters_last_value_range" CHECK ("request_code_counters"."last_value" BETWEEN 1 AND 99999)
);
--> statement-breakpoint
ALTER TABLE "request_steps" DROP CONSTRAINT "request_steps_assignee_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "request_steps_assignee_user_id_status_index";--> statement-breakpoint
ALTER TABLE "request_attachments" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "assignee_lecturer_id" uuid;--> statement-breakpoint
ALTER TABLE "request_steps" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_assignee_lecturer_id_lecturers_id_fk" FOREIGN KEY ("assignee_lecturer_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_steps_assignee_lecturer_id_status_index" ON "request_steps" USING btree ("assignee_lecturer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "request_steps_one_pending" ON "request_steps" USING btree ("request_id") WHERE "request_steps"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "request_steps" DROP COLUMN "assignee_user_id";--> statement-breakpoint
ALTER TABLE "academic_requests" ADD CONSTRAINT "academic_requests_code_format" CHECK ("academic_requests"."code" ~ '^(DT|GV)-[0-9]{4}-[0-9]{5}$');--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_actor_name" CHECK (("request_steps"."acted_at" IS NULL) = ("request_steps"."actor_name" IS NULL));--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_pending_due" CHECK ("request_steps"."status" <> 'pending' OR "request_steps"."due_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "request_steps" ADD CONSTRAINT "request_steps_lecturer_assignee" CHECK (("request_steps"."role" = 'lecturer') = ("request_steps"."assignee_lecturer_id" IS NOT NULL));