import type { Metadata } from "next";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { StudentClassList } from "@/modules/teaching/components/student-class-list";
import { getMyClasses } from "@/modules/teaching/teaching.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Lớp học phần" };

export default async function Page() {
  const [classes, term] = await Promise.all([getMyClasses(), getCurrentTerm()]);
  const unread = classes.reduce((sum, section) => sum + section.unreadCount, 0);
  return (
    <>
      <PageHeader
        title="Lớp học phần"
        description={`${term.name} · ${classes.length} lớp${unread > 0 ? `, ${unread} thông báo chưa đọc` : ""}. Thông báo, đề cương và liên hệ giảng viên của từng lớp.`}
      />
      <StudentClassList classes={classes} />
    </>
  );
}
