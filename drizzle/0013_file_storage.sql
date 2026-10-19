ALTER TABLE "exam_sessions" DROP CONSTRAINT "exam_sessions_paper_fields";--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "paper_file_name" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "paper_content_type" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "paper_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "answer_key_storage_key" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "answer_key_file_name" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "answer_key_content_type" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "answer_key_size_bytes" integer;--> statement-breakpoint
-- Dữ liệu có trước kho lưu tệp chỉ có tên tệp, không có nội dung: gán khóa đúng định dạng của kho (tải xuống sẽ báo
-- "Tệp không còn trong kho lưu trữ") để giữ lại hồ sơ thay vì xóa.
UPDATE "request_attachments" SET "storage_key" = 'requests/' || "id" WHERE "storage_key" IS NULL OR "storage_key" !~ '^requests/[0-9a-f-]{36}$';--> statement-breakpoint
ALTER TABLE "request_attachments" ALTER COLUMN "storage_key" SET NOT NULL;--> statement-breakpoint
UPDATE "exam_sessions" SET
  "paper_storage_key" = 'exams/' || "id",
  "paper_file_name" = coalesce("paper_file_name", 'de-thi.pdf'),
  "paper_content_type" = 'application/pdf',
  "paper_size_bytes" = 1,
  "answer_key_storage_key" = 'exams/' || uuidv7(),
  "answer_key_file_name" = 'dap-an.pdf',
  "answer_key_content_type" = 'application/pdf',
  "answer_key_size_bytes" = 1,
  "paper_submitted_at" = coalesce("paper_submitted_at", now())
WHERE "paper_status" <> 'not-submitted' AND "answer_key_storage_key" IS NULL;--> statement-breakpoint
UPDATE "exam_sessions" SET "paper_storage_key" = NULL, "paper_submitted_at" = NULL WHERE "paper_status" = 'not-submitted';--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_answer_key_storage_key_unique" UNIQUE("answer_key_storage_key");--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_paper_size_range" CHECK ("exam_sessions"."paper_size_bytes" BETWEEN 1 AND 20971520 AND "exam_sessions"."answer_key_size_bytes" BETWEEN 1 AND 20971520);--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_paper_fields" CHECK (num_nonnulls("exam_sessions"."paper_storage_key", "exam_sessions"."paper_file_name", "exam_sessions"."paper_content_type", "exam_sessions"."paper_size_bytes", "exam_sessions"."answer_key_storage_key", "exam_sessions"."answer_key_file_name", "exam_sessions"."answer_key_content_type", "exam_sessions"."answer_key_size_bytes", "exam_sessions"."paper_submitted_at") = CASE WHEN "exam_sessions"."paper_status" = 'not-submitted' THEN 0 ELSE 9 END);