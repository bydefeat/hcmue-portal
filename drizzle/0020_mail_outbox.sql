CREATE TYPE "public"."mail_kind" AS ENUM('account-activation', 'registration-reminder', 'class-announcement');--> statement-breakpoint
CREATE TYPE "public"."mail_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "mail_kind" NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"html" text,
	"status" "mail_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	CONSTRAINT "mail_outbox_recipient_format" CHECK ("mail_outbox"."recipient" ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND length("mail_outbox"."recipient") <= 320),
	CONSTRAINT "mail_outbox_subject_not_blank" CHECK (btrim("mail_outbox"."subject") <> ''),
	CONSTRAINT "mail_outbox_attempts_non_negative" CHECK ("mail_outbox"."attempts" >= 0),
	CONSTRAINT "mail_outbox_sent_fields" CHECK (("mail_outbox"."status" = 'sent') = ("mail_outbox"."sent_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "mail_outbox_due" ON "mail_outbox" USING btree ("next_attempt_at") WHERE "mail_outbox"."status" IN ('pending', 'sending');--> statement-breakpoint
CREATE INDEX "mail_outbox_sent_at" ON "mail_outbox" USING btree ("sent_at") WHERE "mail_outbox"."status" = 'sent';--> statement-breakpoint
CREATE INDEX "mail_outbox_failed_created_at" ON "mail_outbox" USING btree ("created_at") WHERE "mail_outbox"."status" = 'failed';