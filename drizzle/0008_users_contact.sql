ALTER TABLE "lecturers" ADD COLUMN "personal_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lecturers" ADD COLUMN "office" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lecturers" ADD COLUMN "office_hours" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "personal_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "emergency_contact_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "emergency_contact_phone" text DEFAULT '' NOT NULL;