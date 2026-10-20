"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Form, Input, message, Modal, Select } from "antd";
import { closeGraduationRound, saveGraduationRound } from "@/modules/graduation/graduation.action";
import type { GraduationRound } from "@/modules/graduation/graduation.type";
import { toFormFields } from "@/shared/libs/form.lib";

type RoundValues = { name: string; cohorts: number[] };

// Đợt xét tốt nghiệp đang mở: tên đợt (ghi vào quyết định công nhận) và các khóa được xét. Chỉ cán bộ toàn trường sửa được.
export function GraduationRoundForm({ round, cohorts, canManage }: { round: GraduationRound | null; cohorts: number[]; canManage: boolean }) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [form] = Form.useForm<RoundValues>();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const save = (values: RoundValues) =>
    startSaving(async () => {
      const result = await saveGraduationRound(values).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        if (result.fieldErrors) form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      setIsEditing(false);
      messageApi.success(round ? "Đã lưu đợt xét tốt nghiệp" : `Đã mở ${result.data.name}`);
      router.refresh();
    });

  const close = () =>
    modal.confirm({
      title: `Đóng ${round?.name}?`,
      content: "Danh sách xét của đợt không còn hiện cho tới khi mở đợt mới. Hồ sơ đã công nhận và quyết định đã lập giữ nguyên.",
      okText: "Đóng đợt",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await closeGraduationRound();
        if (!result.ok) {
          messageApi.error(result.message);
          return;
        }
        messageApi.success("Đã đóng đợt xét tốt nghiệp");
        router.refresh();
      },
    });

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              form.setFieldsValue(round ? { name: round.name, cohorts: round.cohorts } : { name: "", cohorts: [] });
              setIsEditing(true);
            }}
          >
            {round ? "Sửa đợt xét" : "Mở đợt xét"}
          </Button>
          {round && (
            <Button danger onClick={close}>
              Đóng đợt
            </Button>
          )}
        </div>
      )}
      <Modal
        open={isEditing}
        onCancel={() => setIsEditing(false)}
        title={round ? "Sửa đợt xét tốt nghiệp" : "Mở đợt xét tốt nghiệp"}
        okText={round ? "Lưu" : "Mở đợt"}
        cancelText="Hủy"
        okButtonProps={{ loading: isSaving }}
        onOk={() => form.submit()}
        mask={{ closable: false }}
        forceRender
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="Tên đợt" rules={[{ required: true, whitespace: true, message: "Chưa nhập tên đợt" }]} extra="Ghi vào quyết định công nhận tốt nghiệp, ví dụ: đợt tháng 12 năm 2026.">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="cohorts" label="Khóa được xét" rules={[{ required: true, type: "array", min: 1, message: "Chọn ít nhất một khóa" }]}>
            <Select mode="multiple" options={cohorts.map((cohort) => ({ value: cohort, label: `Khóa ${cohort}` }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
