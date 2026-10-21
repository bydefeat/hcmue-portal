"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, DatePicker, Drawer, Form, Input, message, Modal, Select } from "antd";
import type { Dayjs } from "dayjs";
import { Plus, Trash } from "defeat-icons-react";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { remindSurvey, saveSurvey, toggleSurveyOpen } from "@/modules/surveys/surveys.action";
import { SURVEY_STATUS } from "@/modules/surveys/surveys.constant";
import type { Survey } from "@/modules/surveys/surveys.type";

type Props = {
  surveys: Survey[];
  selected: Survey | null;
  terms: { id: string; name: string }[];
  canManage: boolean;
};

type Values = { termId: string; title: string; period: [Dayjs, Dayjs]; questions: { group: string; text: string }[] };

export function AdminSurveyRounds({ surveys, selected, terms, canManage }: Props) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [editing, setEditing] = useState<Survey | "new" | null>(null);
  const [form] = Form.useForm<Values>();
  const [isSaving, startSaving] = useTransition();
  const isEditable = editing === "new" || editing?.status === "upcoming";

  const open = (target: Survey | "new") => {
    setEditing(target);
    const base = target === "new" ? (selected ?? surveys[0]) : target;
    form.setFieldsValue(
      target === "new"
        ? { termId: terms[0]?.id, title: "", period: undefined, questions: base?.questions.map(({ group, text }) => ({ group, text })) ?? [{ group: "", text: "" }] }
        : { termId: target.termId, title: target.title, period: [dayjs(target.opensAt), dayjs(target.closesAt)], questions: target.questions.map(({ group, text }) => ({ group, text })) },
    );
  };

  const submit = (values: Values) =>
    startSaving(async () => {
      const result = await saveSurvey({
        id: editing === "new" ? null : editing?.id,
        termId: values.termId,
        title: values.title,
        opensAt: values.period[0].toISOString(),
        closesAt: values.period[1].toISOString(),
        questions: values.questions ?? [],
      }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        const { opensAt, closesAt, ...rest } = result.fieldErrors ?? {};
        form.setFields(toFormFields({ ...rest, ...(opensAt || closesAt ? { period: opensAt ?? closesAt } : {}) }));
        messageApi.error(result.message);
        return;
      }
      setEditing(null);
      messageApi.success("Đã lưu đợt khảo sát");
      router.push(`/administrator/reports/surveys?survey=${result.data.id}`);
      router.refresh();
    });

  const toggle = (survey: Survey, next: boolean) =>
    modal.confirm({
      title: next ? `Mở ngay ${survey.title}?` : `Đóng ${survey.title}?`,
      content: next ? "Sinh viên thấy phiếu và gửi được ngay; từ lúc mở không sửa câu hỏi được nữa." : "Sinh viên không gửi phiếu được nữa. Phiếu được xáo lại để ẩn danh, giảng viên xem được kết quả lớp đủ số phiếu.",
      okText: next ? "Mở đợt" : "Đóng đợt",
      okButtonProps: { danger: !next },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await toggleSurveyOpen(survey.id, next).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? "Chưa lưu được, kiểm tra kết nối rồi thử lại.");
          return;
        }
        messageApi.success(next ? "Đã mở đợt khảo sát" : "Đã đóng đợt khảo sát");
        router.refresh();
      },
    });

  const remind = (survey: Survey) =>
    startSaving(async () => {
      const result = await remindSurvey(survey.id).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? "Chưa nhắc được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      messageApi.success(`Đã nhắc ${result.data.students} sinh viên còn lớp chưa đánh giá (${result.data.notified} người nhận trên cổng)`);
      router.refresh();
    });

  return (
    <div className="mb-4 flex flex-col gap-2 sm:mb-6">
      {contextHolder}
      {modalContextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selected?.id}
          onChange={(id: string) => router.push(`/administrator/reports/surveys?survey=${id}`)}
          aria-label="Đợt khảo sát"
          className="w-full sm:w-96"
          options={surveys.map((survey) => ({ value: survey.id, label: `${survey.title} (${SURVEY_STATUS[survey.status].label.toLowerCase()})` }))}
        />
        {selected && <StatusTag status={SURVEY_STATUS[selected.status]} />}
        {canManage && (
          <span className="flex flex-wrap gap-2 sm:ml-auto">
            {selected?.status === "open" && (
              <Button onClick={() => remind(selected)} loading={isSaving}>
                Nhắc sinh viên chưa làm
              </Button>
            )}
            {selected && selected.status !== "closed" && <Button onClick={() => open(selected)}>Sửa đợt</Button>}
            {selected?.status === "upcoming" && <Button onClick={() => toggle(selected, true)}>Mở ngay</Button>}
            {selected?.status === "open" && (
              <Button danger onClick={() => toggle(selected, false)}>
                Đóng đợt
              </Button>
            )}
            <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => open("new")}>
              Tạo đợt
            </Button>
          </span>
        )}
      </div>
      {selected?.remindedAt && <p className="text-xs text-muted tabular-nums">Nhắc sinh viên lần gần nhất {formatDateTime(selected.remindedAt)}</p>}
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        size={640}
        mask={{ closable: false }}
        destroyOnHidden
        title={editing === "new" ? "Tạo đợt khảo sát" : "Sửa đợt khảo sát"}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>Hủy</Button>
            <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
              Lưu
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          {!isEditable && <p className="mb-4 text-sm text-pretty text-muted">Đợt đang mở: chỉ đổi tên và thời điểm đóng; câu hỏi giữ nguyên để mọi phiếu cùng một bộ câu hỏi.</p>}
          <Form.Item name="termId" label="Học kỳ" rules={[{ required: true, message: "Chọn học kỳ" }]}>
            <Select disabled={!isEditable} options={terms.map((term) => ({ value: term.id, label: term.name }))} />
          </Form.Item>
          <Form.Item name="title" label="Tên đợt" rules={[{ required: true, whitespace: true, message: "Nhập tên đợt" }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="period" label="Thời gian mở, đóng" rules={[{ required: true, message: "Chọn thời gian" }]}>
            <DatePicker.RangePicker showTime={{ format: "HH:mm" }} format="HH:mm DD/MM/YYYY" disabled={[!isEditable, false]} className="w-full" />
          </Form.Item>
          <Form.List name="questions">
            {(fields, { add, remove }) => (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Câu hỏi (thang 5 mức)</span>
                {fields.map((field, index) => (
                  <div key={field.key} className="grid gap-x-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                    <Form.Item name={[field.name, "group"]} rules={[{ required: true, whitespace: true, message: "Nhập nhóm" }]} className="mb-2">
                      <Input placeholder="Nhóm" aria-label={`Nhóm câu ${index + 1}`} disabled={!isEditable} />
                    </Form.Item>
                    <Form.Item name={[field.name, "text"]} rules={[{ required: true, whitespace: true, message: "Nhập câu hỏi" }]} className="mb-2">
                      <Input placeholder={`Câu ${index + 1}`} aria-label={`Câu ${index + 1}`} disabled={!isEditable} />
                    </Form.Item>
                    <Button type="text" aria-label={`Bỏ câu ${index + 1}`} icon={<Trash size={16} aria-hidden className="text-zinc-500" />} onClick={() => remove(field.name)} disabled={!isEditable} />
                  </div>
                ))}
                {isEditable && (
                  <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => add({ group: "", text: "" })} className="self-start">
                    Thêm câu hỏi
                  </Button>
                )}
              </div>
            )}
          </Form.List>
        </Form>
      </Drawer>
    </div>
  );
}
