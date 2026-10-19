import type { Metadata } from "next";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { RegistrationHoldTable } from "@/modules/course-registration/components/registration-hold-table";
import { getRegistrationHolds } from "@/modules/course-registration/course-registration.query";
import { getStudents } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Khóa đăng ký" };

export default async function Page() {
  const viewer = await requirePermission("registration.manage");
  const [holds, students] = await Promise.all([getRegistrationHolds(), getStudents()]);
  const scopedHolds = holds.filter((hold) => inScope(viewer, hold.faculty));
  const blocking = scopedHolds.filter((hold) => hold.blocking && !hold.releasedAt).length;

  return (
    <>
      <PageHeader
        title="Khóa đăng ký"
        description={`${blocking} sinh viên đang bị chặn đăng ký học phần. Sinh viên thấy lý do và cách gỡ ngay trên trang đăng ký; gỡ khóa có hiệu lực tức thì.`}
      />
      <RegistrationHoldTable
        holds={scopedHolds}
        students={students
          .filter((student) => inScope(viewer, student.faculty) && student.status !== "graduated")
          .map(({ id, code, fullName, className, faculty }) => ({ id, code, fullName, className, faculty }))}
        actorName={viewer.name}
        studentHrefBase="/administrator/users/students/"
      />
    </>
  );
}
