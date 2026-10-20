CREATE TYPE "public"."discipline_level" AS ENUM('reprimand', 'warning', 'suspension');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'submit';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'sign';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'revoke';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'return';--> statement-breakpoint
ALTER TYPE "public"."audit_entity_type" ADD VALUE 'staff';--> statement-breakpoint
ALTER TYPE "public"."student_status" ADD VALUE 'withdrawn';--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "discipline_level" "discipline_level";--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "target_class_id" uuid;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "previous_status" "student_status";--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "previous_class_id" uuid;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "signed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "return_reason" text;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "revoked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "revoked_by" text;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_target_class_id_administrative_classes_id_fk" FOREIGN KEY ("target_class_id") REFERENCES "public"."administrative_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_previous_class_id_administrative_classes_id_fk" FOREIGN KEY ("previous_class_id") REFERENCES "public"."administrative_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_signed_by_user_id_user_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_decisions_target_class_id_index" ON "student_decisions" USING btree ("target_class_id");--> statement-breakpoint
CREATE INDEX "student_decisions_previous_class_id_index" ON "student_decisions" USING btree ("previous_class_id");--> statement-breakpoint
CREATE INDEX "student_decisions_status_effective_date_index" ON "student_decisions" USING btree ("status","effective_date");--> statement-breakpoint
-- DB seed lại từ đầu thì không cần (seed ghi đủ cột).
UPDATE "student_decisions" SET "discipline_level" = 'reprimand' WHERE "kind" = 'discipline' AND "discipline_level" IS NULL;--> statement-breakpoint
-- Quyết định chuyển ngành cũ: lớp đích là lớp hiện tại của sinh viên (đã chuyển khi ký).
UPDATE "student_decisions" d SET "target_class_id" = s."administrative_class_id"
  FROM "students" s WHERE s."id" = d."student_id" AND d."kind" = 'major-change' AND d."target_class_id" IS NULL;--> statement-breakpoint
UPDATE "student_decisions" SET "revoked_at" = "updated_at", "revoke_reason" = 'Thu hồi trước khi hệ thống ghi lý do thu hồi'
  WHERE "status" = 'revoked' AND ("revoked_at" IS NULL OR "revoke_reason" IS NULL);--> statement-breakpoint
-- Quyết định đã ký trước đây đổi tình trạng ngay khi ký: coi như đã áp dụng (không biết tình trạng trước nên để trống).
UPDATE "student_decisions" SET "applied_at" = "signed_at" WHERE "status" = 'signed' AND "applied_at" IS NULL;--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_discipline_level" CHECK (("student_decisions"."kind" = 'discipline') = ("student_decisions"."discipline_level" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_major_change_target" CHECK (("student_decisions"."kind" = 'major-change') = ("student_decisions"."target_class_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_revoked_fields" CHECK (("student_decisions"."status" = 'revoked') = ("student_decisions"."revoked_at" IS NOT NULL AND "student_decisions"."revoke_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_applied_signed" CHECK ("student_decisions"."applied_at" IS NULL OR "student_decisions"."status" IN ('signed', 'revoked'));--> statement-breakpoint
ALTER TABLE "student_decisions" ADD CONSTRAINT "student_decisions_signer_not_creator" CHECK ("student_decisions"."signed_by_user_id" IS NULL OR "student_decisions"."created_by_user_id" IS NULL OR "student_decisions"."signed_by_user_id" <> "student_decisions"."created_by_user_id");