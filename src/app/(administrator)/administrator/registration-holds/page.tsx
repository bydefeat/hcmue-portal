import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer } from "@/modules/access/access.query";
import { HOLD_KIND_OPTIONS } from "@/modules/course-registration/course-registration.constant";
import { RegistrationHoldTable } from "@/modules/course-registration/components/registration-hold-table";
import { getRegistrationHolds } from "@/modules/course-registration/course-registration.query";
import { getStudents } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Khóa đăng ký" };

export default async function Page() {
  const viewer = await getViewer();
  if (!can(viewer, "registration.manage") && !can(viewer, "tuition.manage")) forbidden();
  const manageableKinds = can(viewer, "registration.manage") ? HOLD_KIND_OPTIONS.map((option) => option.value) : (["tuition"] as const).slice();
  const [holds, students] = await Promise.all([getRegistrationHolds(), getStudents()]);
  const scopedHolds = holds.filter((hold) => inScope(viewer, hold.faculty));
  const blocking = scopedHolds.filter((hold) => hold.blocking && !hold.releasedAt).length;

  return (
    <RegistrationHoldTable
      header={{
        title: "Khóa đăng ký",
        description: `${blocking} sinh viên đang bị chặn đăng ký học phần. Sinh viên thấy lý do và cách gỡ ngay trên trang đăng ký; gỡ khóa có hiệu lực tức thì.`,
      }}
      holds={scopedHolds}
      students={students
        .filter((student) => inScope(viewer, student.faculty) && student.status !== "graduated")
        .map(({ id, code, fullName, className, faculty }) => ({ id, code, fullName, className, faculty }))}
      studentHrefBase="/administrator/users/students/"
      manageableKinds={manageableKinds}
    />
  );
}
