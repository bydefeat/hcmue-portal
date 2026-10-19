ALTER TABLE "roles" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_key_unique" UNIQUE("key");