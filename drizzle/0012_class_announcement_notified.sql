ALTER TABLE "class_announcements" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "class_announcements_pending_idx" ON "class_announcements" USING btree ("publish_at") WHERE "class_announcements"."notified_at" IS NULL;--> statement-breakpoint
ALTER TABLE "class_announcements" ADD CONSTRAINT "class_announcements_notified_published" CHECK ("class_announcements"."notified_at" IS NULL OR "class_announcements"."status" = 'published');--> statement-breakpoint
-- Bài đã đăng trước khi có cột notified_at đều đã được báo lúc đăng; chỉ bài hẹn giờ để trống cho tác vụ class-announcements.
UPDATE "class_announcements" SET "notified_at" = "publish_at" WHERE "status" = 'published' AND "notified_at" IS NULL;
