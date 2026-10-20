import type { Metadata } from "next";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { InvoiceList } from "@/modules/tuition/components/invoice-list";
import { formatMoney } from "@/modules/tuition/tuition.constant";
import { getInvoices, getTuitionRate } from "@/modules/tuition/tuition.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Học phí" };

export default async function Page() {
  const [student, term] = await Promise.all([getCurrentStudent(), getCurrentTerm()]);
  const [invoices, price] = await Promise.all([getInvoices(student.id), getTuitionRate(student.majorCode, term.id)]);

  return (
    <>
      <PageHeader
        title="Học phí"
        description={
          price
            ? `Ngành ${student.majorName}: ${formatMoney(price)} mỗi tín chỉ. Hóa đơn tạm tính cập nhật theo đăng ký, chính thức khi Phòng Kế hoạch - Tài chính chốt học phí; sau khi chốt, thay đổi đăng ký thành dòng điều chỉnh.`
            : `Ngành ${student.majorName} thuộc diện miễn học phí sư phạm, chỉ thu bảo hiểm y tế.`
        }
      />
      <InvoiceList invoices={invoices} studentCode={student.code} currentTermId={term.id} />
    </>
  );
}
