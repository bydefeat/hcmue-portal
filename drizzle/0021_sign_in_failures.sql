CREATE TABLE "sign_in_failures" (
	"username" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "sign_in_failures_window_started_at_index" ON "sign_in_failures" USING btree ("window_started_at");