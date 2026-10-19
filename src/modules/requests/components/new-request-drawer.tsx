"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, message, Select, Upload, type UploadFile } from "antd";
import { Plus, Upload as UploadIcon } from "defeat-icons-react";
import { dayjs } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { ATTACHMENT_LIMIT, REQUEST_KINDS, STUDENT_REQUEST_FIELDS, STUDENT_REQUEST_KINDS } from "@/modules/requests/requests.constant";
import { createStudentRequest } from "@/modules/requests/requests.action";
import type { StudentRequestInput } from "@/modules/requests/requests.rule";
import type { RequestKind, RequestView } from "@/modules/requests/requests.type";
import { RequestInbox } from "@/modules/requests/components/request-inbox";
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

function toInput(values: FormValues, files: UploadFile[]): StudentRequestInput {
  const fields = Object.fromEntries(
    STUDENT_REQUEST_FIELDS[values.kind].map((field) => {
      const value = values[field.name];
      return [field.name, field.kind === "date" && dayjs.isDayjs(value) ? value.format("YYYY-MM-DD") : value];
    }),
  );
  return {
    ...fields,
    kind: values.kind,
    reason: values.reason,
    attachments: files.map((file) => ({ name: file.name, size: file.size ?? 0, type: file.type ?? "" })),
  };
}

type NewRequestDrawerProps = {
  open: boolean;
  requester: Requester;
  sections: SectionOption[];
  overloadMinCpa: number;
  onClose: () => void;
  onSubmit: (request: RequestView) => void;
};

export function NewRequestDrawer({ open, requester, sections, overloadMinCpa, onClose, onSubmit }: NewRequestDrawerProps) {
  const [form] = Form.useForm<FormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isPending, startTransition] = useTransition();
  const kind = Form.useWatch("kind", form);
  const config = kind ? REQUEST_KINDS[kind] : null;
  const blockedReason =
    kind === "overload" && requester.cpa4 < overloadMinCpa
      ? `CPA hiện tại ${requester.cpa4.toFixed(2).replace(".", ",")} dưới ngưỡng ${String(overloadMinCpa).replace(".", ",")} nên chưa đủ điều kiện học vượt tín chỉ.`
      : null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
  }, [open, form]);

  const close = () => {
    setFiles([]);
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
            const result = await createStudentRequest(toInput(values, files));
            if (!result.ok) {
              form.setFields(toFormFields(result.fieldErrors));
              messageApi.error(result.fieldErrors?.attachments ?? result.message);
              return;
            }
            setFiles([]);
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
            <p className="text-sm text-pretty">{config.description}</p>
            <ol className="flex flex-col gap-1 text-xs text-muted">
              {config.steps.map((step, index) => (
                <li key={`${step.role}-${index}`} className="tabular-nums">
                  Bước {index + 1}: {step.label}, tối đa {step.slaDays} ngày làm việc
                </li>
              ))}
            </ol>
          </div>
        )}

        {blockedReason && <Alert type="warning" showIcon title={blockedReason} className="mb-4" description="Đăng ký tối đa 25 tín chỉ trong học kỳ hoặc trao đổi với cố vấn học tập." />}

        {kind &&
          STUDENT_REQUEST_FIELDS[kind].map((field) => (
            <Form.Item key={field.name} name={field.name} label={field.label} rules={[{ required: true, message: `Chưa nhập ${field.label.toLowerCase()}` }]}>
              {field.kind === "number" ? (
                <InputNumber min={field.min} max={field.max} step={field.step} decimalSeparator="," className="w-full" />
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
            <Form.Item label="Minh chứng" extra="PDF hoặc ảnh, tối đa 5 tệp, mỗi tệp không quá 5 MB">
              <Upload
                fileList={files}
                beforeUpload={(file) => {
                  setFiles((current) => [...current, { uid: file.uid, name: file.name, size: file.size, type: file.type, status: "done" as const }].slice(0, ATTACHMENT_LIMIT.files));
                  return false;
                }}
                onRemove={(file) => setFiles((current) => current.filter((entry) => entry.uid !== file.uid))}
                accept=".pdf,.png,.jpg,.jpeg"
              >
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
  overloadMinCpa: number;
};

export function StudentRequestCenter({ requests, requester, sections, overloadMinCpa }: StudentRequestCenterProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(requests);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <PageHeader
        title="Đơn từ"
        description="Theo dõi tiến độ từng bước duyệt. Đơn chưa được tiếp nhận có thể hủy."
        actions={
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setOpen(true)}>
            Tạo đơn
          </Button>
        }
      />
      <RequestInbox key={rows.length} requests={rows} mode="own" showRequester={false} />
      <NewRequestDrawer
        open={open}
        requester={requester}
        sections={sections}
        overloadMinCpa={overloadMinCpa}
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
