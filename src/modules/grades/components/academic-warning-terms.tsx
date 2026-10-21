"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, message, Modal, Select } from "antd";
import { ArrowRotateClockwise } from "defeat-icons-react";
import { generateAcademicWarnings } from "@/modules/grades/grades.action";

type WarningTerm = { id: string; name: string; warnings: number; canGenerate: boolean };

type AcademicWarningTermsProps = {
  terms: WarningTerm[];
  selectedId: string | null;
  canGenerate: boolean;
};

export function AcademicWarningTerms({ terms, selectedId, canGenerate }: AcademicWarningTermsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [isPending, startTransition] = useTransition();
  const selected = terms.find((term) => term.id === selectedId) ?? null;

  const generate = (term: WarningTerm) =>
    modal.confirm({
      title: `Sinh cảnh báo học vụ ${term.name.toLowerCase()}?`,
      content:
        "Tính lại từ kết quả học tập đã công bố đến hết học kỳ. Sinh viên đã có cảnh báo không bị tạo trùng; cảnh báo chưa xử lý được cập nhật theo điểm mới, cảnh báo đã gửi thông báo giữ nguyên. Cố vấn của lớp có cảnh báo mới nhận thông báo.",
      okText: "Sinh cảnh báo",
      cancelText: "Hủy",
      onOk: () =>
        new Promise<void>((resolve) =>
          startTransition(async () => {
            const result = await generateAcademicWarnings(term.id);
            resolve();
            if (!result.ok) {
              messageApi.error(result.message);
              return;
            }
            const { created, updated, removed, handled } = result.data;
            messageApi.success(
              created + updated + removed === 0
                ? `Không có thay đổi: ${result.data.unchanged + handled} cảnh báo đã khớp với kết quả học tập.`
                : `Đã sinh ${created} cảnh báo mới, cập nhật ${updated}, bỏ ${removed} trường hợp nay đã đạt. ${handled} cảnh báo đã xử lý giữ nguyên.`,
            );
            router.push(`${pathname}?term=${term.id}`);
            router.refresh();
          }),
        ),
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {contextHolder}
      {modalContextHolder}
      <Select
        aria-label="Học kỳ"
        value={selected?.id}
        onChange={(id: string) => router.push(`${pathname}?term=${id}`)}
        options={terms.map((term) => ({ value: term.id, label: term.warnings > 0 ? `${term.name} (${term.warnings})` : term.name }))}
        className="w-72 max-w-full"
        placeholder="Chọn học kỳ"
      />
      {canGenerate && selected?.canGenerate && (
        <Button icon={<ArrowRotateClockwise size={16} aria-hidden className="text-zinc-500" />} loading={isPending} onClick={() => generate(selected)}>
          Sinh cảnh báo
        </Button>
      )}
    </div>
  );
}
