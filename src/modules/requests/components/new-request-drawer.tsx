"use client";

import { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, message, Select, Upload, type UploadFile } from "antd";
import { Plus, Upload as UploadIcon } from "defeat-icons-react";
import { dayjs } from "@/shared/libs/date.lib";
import { REQUEST_KINDS, requestView, STEP_ROLE_LABEL, STUDENT_REQUEST_KINDS } from "../requests.constant";
import type { AcademicRequest, RequestDetail, RequestKind, RequestView } from "../requests.type";
import { RequestInbox } from "./request-inbox";

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

type FieldSpec = {
  name: string;
  label: string;
  kind: "number" | "text" | "section" | "date" | "select";
  options?: string[];
  min?: number;
  max?: number;
};

const FIELDS: Record<RequestKind, FieldSpec[]> = {
  overload: [
    { name: "credits", label: "Số tín chỉ xin đăng ký", kind: "number", min: 26, max: 30 },
    { name: "extra", label: "Học phần muốn học thêm", kind: "text" },
  ],
  withdraw: [{ name: "section", label: "Lớp học phần", kind: "section" }],
  "open-class": [
    { name: "course", label: "Mã và tên học phần", kind: "text" },
    { name: "peers", label: "Số sinh viên cùng đề nghị", kind: "number", min: 1, max: 200 },
  ],
  regrade: [
    { name: "section", label: "Lớp học phần", kind: "section" },
    { name: "score", label: "Điểm thi hiện tại", kind: "number", min: 0, max: 10 },
  ],
  "exam-postpone": [
    { name: "section", label: "Lớp học phần", kind: "section" },
    { name: "examDate", label: "Ngày thi", kind: "date" },
  ],
  reserve: [{ name: "duration", label: "Thời gian bảo lưu", kind: "select", options: ["1 học kỳ", "2 học kỳ"] }],
  transcript: [
    { name: "copies", label: "Số bản", kind: "number", min: 1, max: 10 },
    { name: "language", label: "Ngôn ngữ", kind: "select", options: ["Tiếng Việt", "Tiếng Anh", "Cả hai"] },
    { name: "delivery", label: "Hình thức nhận", kind: "select", options: ["Nhận tại Phòng Đào tạo", "Bản điện tử qua email"] },
  ],
  "credit-transfer": [
    { name: "source", label: "Học phần đã học (mã, tên, số tín chỉ, điểm)", kind: "text" },
    { name: "school", label: "Nơi học", kind: "text" },
    { name: "target", label: "Học phần xin công nhận", kind: "text" },
  ],
  "grade-change": [],
  "teaching-leave": [],
};

type FormValues = Record<string, string | number | dayjs.Dayjs | undefined> & { kind: RequestKind; reason: string };

function fieldValueText(field: FieldSpec, value: FormValues[string], sections: SectionOption[]) {
  if (value === undefined || value === "") return "";
  if (field.kind === "section") return sections.find((option) => option.value === value)?.label ?? String(value);
  if (field.kind === "date") return dayjs(value as dayjs.Dayjs).format("DD/MM/YYYY");
  return String(value);
}

function buildRequest(values: FormValues, requester: Requester, sections: SectionOption[], files: UploadFile[], sequence: number): AcademicRequest {
  const config = REQUEST_KINDS[values.kind];
  const fields = FIELDS[values.kind];
  const details: RequestDetail[] = fields
    .map((field) => ({ label: field.label, value: fieldValueText(field, values[field.name], sections) }))
    .filter((detail) => detail.value);
  const now = dayjs();
  const subjectField = fields.find((field) => field.kind === "section" || field.name === "course");
  const subject = subjectField ? fieldValueText(subjectField, values[subjectField.name], sections) : config.label;
  return {
    id: `don-moi-${now.valueOf()}`,
    code: `DT-${now.year()}-${String(9000 + sequence).padStart(5, "0")}`,
    kind: values.kind,
    requesterType: "student",
    requesterId: requester.id,
    requesterName: requester.name,
    requesterCode: requester.code,
    requesterUnit: requester.unit,
    faculty: requester.faculty,
    subject,
    details,
    reason: values.reason,
    attachments: files.map((file) => file.name),
    createdAt: now.toISOString(),
    cancelledAt: null,
    steps: config.steps.map((step, index) => ({
      role: step.role,
      label: step.label,
      assigneeId: step.role === "advisor" ? requester.advisorId : null,
      assigneeName: step.role === "advisor" ? requester.advisorName : STEP_ROLE_LABEL[step.role],
      status: index === 0 ? "pending" : "waiting",
      actorName: null,
      actedAt: null,
      comment: null,
      dueAt: index === 0 ? now.add(step.slaDays, "day").toISOString() : null,
    })),
  };
}

type NewRequestDrawerProps = {
  open: boolean;
  requester: Requester;
  sections: SectionOption[];
  overloadMinCpa: number;
  onClose: () => void;
  onSubmit: (request: AcademicRequest) => void;
  sequence: number;
};

export function NewRequestDrawer({ open, requester, sections, overloadMinCpa, onClose, onSubmit, sequence }: NewRequestDrawerProps) {
  const [form] = Form.useForm<FormValues>();
  const [files, setFiles] = useState<UploadFile[]>([]);
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
          <Button type="primary" disabled={!kind || Boolean(blockedReason)} onClick={() => form.submit()}>
            Gửi đơn
          </Button>
        </div>
      }
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={(values) => {
          onSubmit(buildRequest(values, requester, sections, files, sequence));
          setFiles([]);
        }}
      >
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
          FIELDS[kind].map((field) => (
            <Form.Item key={field.name} name={field.name} label={field.label} rules={[{ required: true, message: `Chưa nhập ${field.label.toLowerCase()}` }]}>
              {field.kind === "number" ? (
                <InputNumber min={field.min} max={field.max} step={field.max === 10 ? 0.25 : 1} decimalSeparator="," className="w-full" />
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
                  setFiles((current) => [...current, { uid: file.uid, name: file.name, status: "done" as const }].slice(0, 5));
                  return false;
                }}
                onRemove={(file) => setFiles((current) => current.filter((entry) => entry.uid !== file.uid))}
                accept=".pdf,.png,.jpg,.jpeg"
              >
                <Button icon={<UploadIcon size={16} aria-hidden />}>Chọn tệp</Button>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-pretty text-muted">Theo dõi tiến độ từng bước duyệt. Đơn chưa được tiếp nhận có thể hủy.</p>
        <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setOpen(true)} className="shrink-0">
          Tạo đơn
        </Button>
      </div>
      <RequestInbox key={rows.length} requests={rows} mode="own" actorName={requester.name} showRequester={false} />
      <NewRequestDrawer
        open={open}
        requester={requester}
        sections={sections}
        overloadMinCpa={overloadMinCpa}
        sequence={rows.length}
        onClose={() => setOpen(false)}
        onSubmit={(request) => {
          setRows((current) => [requestView(request), ...current]);
          setOpen(false);
          messageApi.success(`Đã gửi đơn ${request.code}. Theo dõi tiến độ trong danh sách.`);
        }}
      />
    </div>
  );
}
