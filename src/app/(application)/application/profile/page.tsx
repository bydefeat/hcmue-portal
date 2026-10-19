import type { Metadata } from "next";
import { Envelope, Phone } from "defeat-icons-react";
import { StudentProfileCard } from "@/modules/users/components/student-profile-card";
import { StudentProfileContactForm } from "@/modules/users/components/student-profile-contact-form";
import { StudentProfileDecisions } from "@/modules/users/components/student-profile-decisions";
import { getAdvisorOf, getCurrentStudent, getDecisions } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";

export const metadata: Metadata = { title: "Hồ sơ" };

export default async function Page() {
  const student = await getCurrentStudent();
  const [advisor, decisions] = await Promise.all([getAdvisorOf(student.id), getDecisions(student.id)]);

  return (
    <>
      <PageHeader title="Hồ sơ" description={`${student.fullName} · ${student.code} · Lớp ${student.className}`} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <StudentProfileCard student={student} advisorName={advisor?.displayName ?? null} />
          <SectionCard title="Cố vấn học tập">
            {advisor ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium">{advisor.displayName}</p>
                <p className="text-xs text-muted">{advisor.faculty}</p>
                <a href={`mailto:${advisor.email}`} title={advisor.email} className="flex min-w-0 items-center gap-2 text-sm">
                  <Envelope size={16} aria-hidden className="shrink-0 text-muted" />
                  <span className="truncate">{advisor.email}</span>
                </a>
                <a href={`tel:${advisor.phone}`} className="flex items-center gap-2 text-sm tabular-nums">
                  <Phone size={16} aria-hidden className="shrink-0 text-muted" />
                  {advisor.phone}
                </a>
              </div>
            ) : (
              <p className="text-sm text-pretty text-muted">Lớp {student.className} chưa được phân công cố vấn. Liên hệ văn phòng khoa để được hỗ trợ.</p>
            )}
          </SectionCard>
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
    </>
  );
}
