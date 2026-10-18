import { LecturerLayout } from "@/shared/components/layouts/lecturer";
import { getCurrentLecturer } from "@/modules/users/users.query";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lecturer = await getCurrentLecturer();
  const user = { name: lecturer.displayName, code: lecturer.code, role: lecturer.faculty };
  return (
    <LecturerLayout user={user} isAdvisor={lecturer.isAdvisor}>
      {children}
    </LecturerLayout>
  );
}
