import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { LecturerRequestBoard } from "@/modules/requests/components/lecturer-request-board";
import { getRequestsForAssignee, getRequestsOf } from "@/modules/requests/requests.query";
import { getCurrentLecturer } from "@/modules/users/users.query";
import { lecturerRequestOptions } from "@/app/(lecturer)/lecturer/_data/request-options";

export const metadata: Metadata = { title: "Đơn từ" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, lecturer] = await Promise.all([searchParams, getCurrentLecturer()]);
  const [assigned, own, options] = await Promise.all([
    getRequestsForAssignee(lecturer.id, ["advisor", "lecturer"]),
    getRequestsOf(lecturer.id),
    lecturerRequestOptions(lecturer),
  ]);
  const overdue = assigned.filter((request) => request.isOverdue).length;

  return (
    <>
      <PageHeader
        title="Đơn từ"
        description={
          overdue > 0
            ? `${overdue} đơn đã quá hạn ở bước của bạn. Đơn của sinh viên cố vấn và phúc khảo lớp bạn dạy cần xử lý trong hạn quy định.`
            : "Duyệt đơn của sinh viên cố vấn, chấm phúc khảo, gửi đơn sửa điểm hoặc nghỉ dạy, dạy bù."
        }
      />
      <LecturerRequestBoard assigned={assigned} own={own} initialTab={tab === "own" ? "own" : undefined} {...options} />
    </>
  );
}
