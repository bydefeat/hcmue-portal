ALTER TYPE "public"."audit_entity_type" ADD VALUE 'course';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'graduation';--> statement-breakpoint
CREATE TABLE "graduation_rounds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"cohorts" smallint[] NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graduation_rounds_has_cohort" CHECK (cardinality("graduation_rounds"."cohorts") > 0)
);
--> statement-breakpoint
ALTER TABLE "regulations" DROP CONSTRAINT "regulations_rules_object";--> statement-breakpoint
ALTER TABLE "graduation_records" ADD COLUMN "language_level" text;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD COLUMN "certificates_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD COLUMN "certificates_verified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD COLUMN "round_id" uuid;--> statement-breakpoint
ALTER TABLE "graduation_rounds" ADD CONSTRAINT "graduation_rounds_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_rounds_single_open" ON "graduation_rounds" USING btree ("is_open") WHERE "graduation_rounds"."is_open";--> statement-breakpoint
CREATE INDEX "graduation_rounds_created_by_user_id_index" ON "graduation_rounds" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_certificates_verified_by_user_id_user_id_fk" FOREIGN KEY ("certificates_verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_round_id_graduation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."graduation_rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "graduation_records_round_id_index" ON "graduation_records" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "graduation_records_certificates_verified_by_user_id_index" ON "graduation_records" USING btree ("certificates_verified_by_user_id");--> statement-breakpoint
ALTER TABLE "graduation_records" ADD CONSTRAINT "graduation_records_language_level" CHECK ("graduation_records"."language_level" IS NULL OR "graduation_records"."language_level" IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));--> statement-breakpoint
ALTER TABLE "regulations" ADD CONSTRAINT "regulations_rules_object" CHECK (jsonb_typeof("regulations"."rules") = 'object' AND "regulations"."rules" ?& array['grading', 'credits', 'warning', 'attendance', 'workflow', 'graduation']);