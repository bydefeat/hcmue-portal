import type { Metadata } from "next";
import { Envelope, Phone } from "defeat-icons-react";
import { StudentProfileCard } from "@/modules/users/components/student-profile-card";
import { StudentProfileContactForm } from "@/modules/users/components/student-profile-contact-form";
import { StudentProfileDecisions } from "@/modules/users/components/student-profile-decisions";
import { getAdvisorOf, getCurrentStudent, getDecisions } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Hồ sơ" };

export default async function Page() {
  const student = await getCurrentStudent();
  const [advisor, decisions] = await Promise.all([getAdvisorOf(student.id), getDecisions(student.id)]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        <StudentProfileCard student={student} advisorName={advisor?.displayName ?? null} />
        <section className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface p-4 sm:p-5">
          <h2 className="text-base font-semibold">Cố vấn học tập</h2>
          {advisor ? (
            <>
              <p className="font-medium">{advisor.displayName}</p>
              <p className="text-xs text-muted">{advisor.faculty}</p>
              <a href={`mailto:${advisor.email}`} className="flex items-center gap-2 text-sm break-all">
                <Envelope size={16} aria-hidden className="shrink-0 text-muted" />
                {advisor.email}
              </a>
              <a href={`tel:${advisor.phone}`} className="flex items-center gap-2 text-sm tabular-nums">
                <Phone size={16} aria-hidden className="shrink-0 text-muted" />
                {advisor.phone}
              </a>
            </>
          ) : (
            <p className="text-sm text-pretty text-muted">Lớp {student.className} chưa được phân công cố vấn. Liên hệ văn phòng khoa để được hỗ trợ.</p>
          )}
        </section>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <StudentProfileContactForm
          initialValues={{
            schoolEmail: student.email,
            personalEmail: "",
            phone: student.phone,
            address: "",
            emergencyName: "",
            emergencyPhone: "",
          }}
        />
        <StudentProfileDecisions decisions={decisions} />
      </div>
    </div>
  );
}
