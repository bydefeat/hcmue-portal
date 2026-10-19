CREATE TYPE "public"."payment_source" AS ENUM('bank-sync', 'statement', 'manual');--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_reference_unique";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "source" "payment_source" DEFAULT 'bank-sync' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recorded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recorded_by_label" text DEFAULT 'Đối soát ngân hàng' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voided_by_label" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_recorded_by_user_id_index" ON "payments" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "payments_voided_by_user_id_index" ON "payments" USING btree ("voided_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" USING btree ("reference") WHERE "payments"."voided_at" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_not_blank" CHECK (btrim("payments"."reference") <> '');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_void_fields" CHECK (("payments"."voided_at" IS NULL) = ("payments"."void_reason" IS NULL) AND ("payments"."voided_at" IS NULL) = ("payments"."voided_by_label" IS NULL));