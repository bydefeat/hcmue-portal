ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_reserved_seat_id_reserved_seats_id_fk";
--> statement-breakpoint
ALTER TABLE "course_results" DROP CONSTRAINT "course_results_enrollment_id_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_identity" UNIQUE("id","student_id","course_id","term_id");
--> statement-breakpoint
ALTER TABLE "reserved_seats" ADD CONSTRAINT "reserved_seats_identity" UNIQUE("id","class_section_id");
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_reserved_seat_fk" FOREIGN KEY ("reserved_seat_id","class_section_id") REFERENCES "public"."reserved_seats"("id","class_section_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_results" ADD CONSTRAINT "course_results_enrollment_fk" FOREIGN KEY ("enrollment_id","student_id","course_id","term_id") REFERENCES "public"."enrollments"("id","student_id","course_id","term_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "enrollments_reserved_seat_id_index" ON "enrollments" USING btree ("reserved_seat_id");
--> statement-breakpoint
ALTER TABLE "registration_holds" ADD CONSTRAINT "registration_holds_release_after_create" CHECK ("registration_holds"."released_at" IS NULL OR "registration_holds"."released_at" >= "registration_holds"."created_at");
