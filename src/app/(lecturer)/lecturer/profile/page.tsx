import type { Metadata } from "next";
import Link from "next/link";
import { getLecturerClassSections, getTerms } from "@/modules/course-registration/course-registration.query";
import { ChangePasswordCard } from "@/modules/authentication/components/change-password-card";
import { LecturerProfileCard } from "@/modules/users/components/lecturer-profile-card";
import { getAdvisedClasses, getCurrentLecturer } from "@/modules/users/users.query";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";

export const metadata: Metadata = { title: "Hồ sơ cá nhân" };

export default async function Page() {
  const lecturer = await getCurrentLecturer();
  const [terms, advisedClasses] = await Promise.all([getTerms(), getAdvisedClasses(lecturer.id)]);
  const history = await Promise.all(
    [...terms].toReversed().map(async (term) => ({ term, sections: await getLecturerClassSections(lecturer.id, term.id) })),
  );
  const withSections = history.filter((entry) => entry.sections.length > 0);

  return (
    <>
      <PageHeader title="Hồ sơ cá nhân" description="Thông tin liên hệ hiển thị cho sinh viên cố vấn và sinh viên trong lớp bạn dạy." />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <LecturerProfileCard lecturer={lecturer} />
          <ChangePasswordCard />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Lớp cố vấn">
            <div className="flex flex-col gap-3">
              {advisedClasses.length === 0 ? (
                <p className="text-sm text-muted">Bạn chưa được phân công cố vấn lớp nào.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {advisedClasses.map((entry) => (
                    <li key={entry.className} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="flex min-w-0 flex-col">
                        {entry.className}
                        <span className="text-xs text-muted">
                          {entry.majorName}, khóa {entry.cohort}
                        </span>
                      </span>
                      <span className="shrink-0 text-muted tabular-nums">{entry.studentCount} sinh viên</span>
                    </li>
                  ))}
                </ul>
              )}
              {advisedClasses.length > 0 && (
                <Link href="/lecturer/advising/students" className="text-sm">
                  Xem sinh viên cố vấn
                </Link>
              )}
            </div>
          </SectionCard>
          <SectionCard title="Lớp giảng dạy theo học kỳ">
            {withSections.length === 0 ? (
              <EmptyState illustration="board" title="Chưa có lớp học phần" />
            ) : (
              <div className="flex flex-col gap-4">
                {withSections.map(({ term, sections }) => (
                  <div key={term.id} className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      {term.name}
                      {term.isCurrent && <span className="ml-2 text-xs font-normal text-muted">đang dạy</span>}
                      {term.isRegistrationTarget && <span className="ml-2 text-xs font-normal text-muted">dự kiến</span>}
                    </span>
                    <ul className="flex flex-col text-sm">
                      {sections.map((section) => (
                        <li key={section.id} className="flex items-center justify-between gap-3 py-1">
                          {term.isCurrent ? (
                            <Link href={`/lecturer/classes/${section.id}`} className="min-w-0 truncate">
                              {section.courseName}
                            </Link>
                          ) : (
                            <span className="min-w-0 truncate">{section.courseName}</span>
                          )}
                          <span className="shrink-0 text-xs text-muted tabular-nums">
                            {section.code} · {section.enrolled}/{section.capacity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
