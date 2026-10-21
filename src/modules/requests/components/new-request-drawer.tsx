"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, message, Select, Upload } from "antd";
import { Plus, Upload as UploadIcon } from "defeat-icons-react";
import { dayjs } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { acceptOf } from "@/shared/libs/upload.lib";
import { ATTACHMENT_HINT, ATTACHMENT_LIMIT, REQUEST_KINDS, STUDENT_REQUEST_FIELDS, STUDENT_REQUEST_KINDS } from "@/modules/requests/requests.constant";
import { createStudentRequest } from "@/modules/requests/requests.action";
import { overloadBounds, requestKindDescription, type StudentRequestInput } from "@/modules/requests/requests.rule";
import type { RequestKind, RequestRules, RequestView } from "@/modules/requests/requests.type";
import { RequestInbox } from "@/modules/requests/components/request-inbox";
import { formErrorsWithoutAttachments, requestFormData, useAttachmentPicker } from "@/modules/requests/components/attachment-picker";
import { PageHeader } from "@/shared/components/ui/page-header";

type SectionOption = { value: string; label: string };

type Requester = {
  id: string;
  name: string;
  code: string;
  unit: string;
  faculty: string;
  cpa4: number;
  advisorId: string | null;
  advisorName: string | null;
};

type FormValues = Record<string, string | number | dayjs.Dayjs | undefined> & { kind: RequestKind; reason: string };

function toInput(values: FormValues): StudentRequestInput {
  const fields = Object.fromEntries(
    STUDENT_REQUEST_FIELDS[values.kind].map((field) => {
      const value = values[field.name];
      return [field.name, field.kind === "date" && dayjs.isDayjs(value) ? value.format("YYYY-MM-DD") : value];
    }),
  );
  return { ...fields, kind: values.kind, reason: values.reason };
}

type NewRequestDrawerProps = {
  open: boolean;
  requester: Requester;
  sections: SectionOption[];
  rules: RequestRules;
  onClose: () => void;
  onSubmit: (request: RequestView) => void;
};

export function NewRequestDrawer({ open, requester, sections, rules, onClose, onSubmit }: NewRequestDrawerProps) {
  const [form] = Form.useForm<FormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const picker = useAttachmentPicker((text) => messageApi.error(text));
  const [isPending, startTransition] = useTransition();
  const kind = Form.useWatch("kind", form);
  const config = kind ? REQUEST_KINDS[kind] : null;
  const blockedReason =
    kind === "overload" && requester.cpa4 < rules.overloadMinCpa
      ? `CPA hiện tại ${requester.cpa4.toFixed(2).replace(".", ",")} dưới ngưỡng ${String(rules.overloadMinCpa).replace(".", ",")} nên chưa đủ điều kiện học vượt tín chỉ.`
      : null;
  const overload = overloadBounds(rules);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
  }, [open, form]);

  const close = () => {
    picker.clear();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      size={560}
      destroyOnHidden
      mask={{ closable: false }}
      title="Tạo đơn mới"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Hủy</Button>
          <Button type="primary" disabled={!kind || Boolean(blockedReason)} loading={isPending} onClick={() => form.submit()}>
            Gửi đơn
          </Button>
        </div>
      }
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={(values) =>
          startTransition(async () => {
            const result = await createStudentRequest(requestFormData(toInput(values), picker.files)).catch(() => null);
            if (!result) {
              messageApi.error("Chưa gửi được, kiểm tra kết nối rồi thử lại.");
              return;
            }
            if (!result.ok) {
              form.setFields(toFormFields(formErrorsWithoutAttachments(result.fieldErrors)));
              messageApi.error(result.fieldErrors?.attachments ?? result.message);
              return;
            }
            picker.clear();
            onSubmit(result.data);
          })
        }
      >
        {contextHolder}
        <Form.Item name="kind" label="Loại đơn" rules={[{ required: true, message: "Chưa chọn loại đơn" }]}>
          <Select options={STUDENT_REQUEST_KINDS.map((value) => ({ value, label: REQUEST_KINDS[value].label }))} />
        </Form.Item>

        {config && (
          <div className="mb-6 flex flex-col gap-2 rounded-lg bg-background p-3">
            <p className="text-sm text-pretty">{requestKindDescription(kind, rules)}</p>
            <ol className="flex flex-col gap-1 text-xs text-muted">
              {config.steps.map((step, index) => (
                <li key={`${step.role}-${index}`} className="tabular-nums">
                  Bước {index + 1}: {step.label}, tối đa {step.slaDays} ngày làm việc
                </li>
              ))}
            </ol>
          </div>
        )}

        {blockedReason && <Alert type="warning" showIcon title={blockedReason} className="mb-4" description={`Đăng ký tối đa ${rules.maxPerTerm} tín chỉ trong học kỳ hoặc trao đổi với cố vấn học tập.`} />}

        {kind &&
          STUDENT_REQUEST_FIELDS[kind].map((field) => (
            <Form.Item key={field.name} name={field.name} label={field.label} rules={[{ required: true, message: `Chưa nhập ${field.label.toLowerCase()}` }]}>
              {field.kind === "number" ? (
                <InputNumber
                  min={kind === "overload" && field.name === "credits" ? overload.min : field.min}
                  max={kind === "overload" && field.name === "credits" ? overload.max : field.max}
                  step={field.step}
                  decimalSeparator=","
                  className="w-full"
                />
              ) : field.kind === "section" ? (
                <Select options={sections} showSearch={{ optionFilterProp: "label" }} notFoundContent="Không có lớp đang học" />
              ) : field.kind === "date" ? (
                <DatePicker format="DD/MM/YYYY" className="w-full" />
              ) : field.kind === "select" ? (
                <Select options={field.options?.map((value) => ({ value, label: value }))} />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}

        {kind && (
          <>
            <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]}>
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount />
            </Form.Item>
            <Form.Item label="Minh chứng" required={REQUEST_KINDS[kind].attachmentsRequired} extra={ATTACHMENT_HINT}>
              <Upload multiple fileList={picker.fileList} beforeUpload={picker.beforeUpload} onRemove={picker.onRemove} accept={acceptOf(ATTACHMENT_LIMIT.kinds)}>
                <Button icon={<UploadIcon size={16} aria-hidden className="text-zinc-500" />}>Chọn tệp</Button>
              </Upload>
            </Form.Item>
          </>
        )}
      </Form>
    </Drawer>
  );
}

type StudentRequestCenterProps = {
  requests: RequestView[];
  requester: Requester;
  sections: SectionOption[];
  rules: RequestRules;
  initialOpenId?: string;
};

export function StudentRequestCenter({ requests, requester, sections, rules, initialOpenId }: StudentRequestCenterProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(requests);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState(initialOpenId);

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <PageHeader
        title="Đơn từ"
        description="Theo dõi tiến độ từng bước duyệt. Đơn chưa được tiếp nhận có thể hủy; đơn bị từ chối có thể gửi lại."
        actions={
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setOpen(true)}>
            Tạo đơn
          </Button>
        }
      />
      <RequestInbox
        key={rows.length}
        requests={rows}
        mode="own"
        showRequester={false}
        initialOpenId={openId}
        onCreated={(request) => {
          setRows((current) => [request, ...current.filter((row) => row.id !== request.id).map((row) => (row.id === request.resubmittedFrom?.id ? { ...row, resubmittedAs: { id: request.id, code: request.code }, can: { ...row.can, resubmit: false } } : row))]);
          setOpenId(request.id);
          messageApi.success(`Đã gửi lại thành đơn ${request.code}`);
        }}
      />
      <NewRequestDrawer
        open={open}
        requester={requester}
        sections={sections}
        rules={rules}
        onClose={() => setOpen(false)}
        onSubmit={(request) => {
          setRows((current) => [request, ...current]);
          setOpen(false);
          messageApi.success(`Đã gửi đơn ${request.code}. Theo dõi tiến độ trong danh sách.`);
        }}
      />
    </div>
  );
}
