CREATE TYPE "public"."invoice_line_kind" AS ENUM('tuition', 'fee', 'adjustment');--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'term';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'tuition';--> statement-breakpoint
CREATE TABLE "tuition_refunds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(14, 0) NOT NULL,
	"refunded_at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" uuid,
	"recorded_by_label" text NOT NULL,
	CONSTRAINT "tuition_refunds_amount_positive" CHECK ("tuition_refunds"."amount" > 0),
	CONSTRAINT "tuition_refunds_reference_not_blank" CHECK (btrim("tuition_refunds"."reference") <> '')
);
--> statement-breakpoint
ALTER TABLE "registration_periods" DROP CONSTRAINT "registration_periods_credit_range";--> statement-breakpoint
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_unit_price_non_negative";--> statement-breakpoint
ALTER TABLE "registration_periods" ALTER COLUMN "min_credits" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registration_periods" ALTER COLUMN "max_credits" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "recorded_by_label" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "kind" "invoice_line_kind" DEFAULT 'tuition' NOT NULL;--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD COLUMN "discount_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD COLUMN "finalized_by_label" text;--> statement-breakpoint
ALTER TABLE "tuition_refunds" ADD CONSTRAINT "tuition_refunds_invoice_id_tuition_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tuition_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_refunds" ADD CONSTRAINT "tuition_refunds_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tuition_refunds_invoice_id_index" ON "tuition_refunds" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "tuition_refunds_recorded_by_user_id_index" ON "tuition_refunds" USING btree ("recorded_by_user_id");--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_enrolled_only_when_open" CHECK ("class_sections"."status" = 'open' OR "class_sections"."enrolled_count" = 0);--> statement-breakpoint
ALTER TABLE "registration_periods" ADD CONSTRAINT "registration_periods_credit_range" CHECK (("registration_periods"."min_credits" IS NULL OR "registration_periods"."min_credits" >= 0) AND ("registration_periods"."max_credits" IS NULL OR "registration_periods"."max_credits" > 0) AND ("registration_periods"."min_credits" IS NULL OR "registration_periods"."max_credits" IS NULL OR "registration_periods"."min_credits" <= "registration_periods"."max_credits"));--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_unit_price_non_negative" CHECK ("invoice_lines"."unit_price" >= 0 OR "invoice_lines"."kind" = 'adjustment');--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_discount_reason" CHECK ("tuition_invoices"."discount" = 0 OR btrim("tuition_invoices"."discount_reason") <> '');--> statement-breakpoint
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_finalized_fields" CHECK (("tuition_invoices"."finalized_at" IS NULL) = ("tuition_invoices"."finalized_by_label" IS NULL));