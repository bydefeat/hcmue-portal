"use client";

import { useState, useTransition } from "react";
import { Button, Checkbox, Form, Input, Modal, Radio, Select, Upload } from "antd";
import { Upload as UploadIcon } from "defeat-icons-react";
import { acceptOf } from "@/shared/libs/upload.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { ATTACHMENT_HINT, ATTACHMENT_LIMIT, isOfficeStep } from "@/modules/requests/requests.constant";
import { reassignRequestStep, resubmitRequest, submitRequestSupplement, superviseRequestStep } from "@/modules/requests/requests.action";
import { formErrorsWithoutAttachments, requestFormData, useAttachmentPicker } from "@/modules/requests/components/attachment-picker";
import type { RequestView } from "@/modules/requests/requests.type";

type Done = (request: RequestView, text: string) => void;
type Fail = (text: string) => void;

export type ReassignCandidate = { id: string; label: string; faculty: string };

export function SuperviseModal({ request, open, onClose, onDone, onFail }: { request: RequestView; open: boolean; onClose: () => void; onDone: Done; onFail: Fail }) {
  const [form] = Form.useForm<{ decision: "approved" | "rejected" | "skipped"; reason: string }>();
  const [isPending, startTransition] = useTransition();
  const step = request.steps.findIndex((entry) => entry.status === "pending");
  return (
    <Modal
      open={open}
      title={`Xử lý thay bước "${request.currentStep?.label ?? ""}"`}
      okText="Lưu"
      cancelText="Hủy"
      confirmLoading={isPending}
      mask={{ closable: false }}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          startTransition(async () => {
            const result = await superviseRequestStep(request.id, { step, ...values }).catch(() => null);
            if (!result) return onFail("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
            if (!result.ok) {
              form.setFields(toFormFields(formErrorsWithoutAttachments(result.fieldErrors)));
              return onFail(result.message);
            }
            onDone(result.data, `Đã xử lý thay bước của đơn ${request.code}`);
          })
        }
      >
        <p className="mb-4 text-sm text-pretty text-muted">
          Dùng khi người xử lý vắng lâu hoặc bước không còn người phụ trách. Bước ghi rõ do Phòng Đào tạo xử lý thay, kèm lý do.
        </p>
        <Form.Item name="decision" label="Cách xử lý" rules={[{ required: true, message: "Chưa chọn cách xử lý" }]}>
          <Radio.Group
            options={[
              { value: "approved", label: "Đồng ý" },
              { value: "rejected", label: "Không đồng ý" },
              { value: "skipped", label: "Bỏ qua bước" },
            ]}
          />
        </Form.Item>
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Ghi lý do xử lý thay" }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ReassignModal({
  request,
  candidates,
  open,
  onClose,
  onDone,
  onFail,
}: {
  request: RequestView;
  candidates: ReassignCandidate[];
  open: boolean;
  onClose: () => void;
  onDone: Done;
  onFail: Fail;
}) {
  const [form] = Form.useForm<{ step: number; lecturerId: string; reason: string }>();
  const [isPending, startTransition] = useTransition();
  const steps = request.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => !isOfficeStep(step.role) && (step.status === "pending" || step.status === "waiting"));
  return (
    <Modal
      open={open}
      title={`Chuyển người xử lý đơn ${request.code}`}
      okText="Chuyển"
      cancelText="Hủy"
      confirmLoading={isPending}
      mask={{ closable: false }}
      destroyOnHidden
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={steps.length === 1 ? { step: steps[0].index } : undefined}
        onFinish={(values) =>
          startTransition(async () => {
            const result = await reassignRequestStep(request.id, values).catch(() => null);
            if (!result) return onFail("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
            if (!result.ok) {
              form.setFields(toFormFields(formErrorsWithoutAttachments(result.fieldErrors)));
              return onFail(result.message);
            }
            onDone(result.data, `Đã chuyển người xử lý đơn ${request.code}`);
          })
        }
      >
        <Form.Item name="step" label="Bước" rules={[{ required: true, message: "Chưa chọn bước" }]}>
          <Select options={steps.map(({ step, index }) => ({ value: index, label: `${step.label}${step.assigneeName ? ` (đang giao: ${step.assigneeName})` : ""}` }))} />
        </Form.Item>
        <Form.Item name="lecturerId" label="Giảng viên nhận" rules={[{ required: true, message: "Chưa chọn giảng viên" }]}>
          <Select
            showSearch={{ optionFilterProp: "label" }}
            options={Object.entries(Object.groupBy(candidates, (candidate) => candidate.faculty)).map(([faculty, entries]) => ({
              label: faculty,
              options: (entries ?? []).map((entry) => ({ value: entry.id, label: entry.label })),
            }))}
          />
        </Form.Item>
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Ghi lý do chuyển người xử lý" }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function SupplementForm({ request, onDone, onFail }: { request: RequestView; onDone: Done; onFail: Fail }) {
  const [note, setNote] = useState("");
  const picker = useAttachmentPicker(onFail);
  const [isPending, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      if (picker.files.length === 0 && !note.trim()) return onFail("Thêm tệp minh chứng hoặc ghi chú phần bổ sung.");
      const result = await submitRequestSupplement(requestFormData({ requestId: request.id, note }, picker.files)).catch(() => null);
      if (!result) return onFail("Chưa gửi được, kiểm tra kết nối rồi thử lại.");
      if (!result.ok) return onFail(result.fieldErrors?.attachments ?? result.message);
      picker.clear();
      setNote("");
      onDone(result.data, `Đã bổ sung đơn ${request.code}, đơn tiếp tục được xử lý`);
    });
  return (
    <div className="flex flex-col gap-2">
      <Input.TextArea value={note} onChange={(event) => setNote(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} placeholder="Ghi chú phần bổ sung" aria-label="Ghi chú bổ sung" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Upload multiple fileList={picker.fileList} beforeUpload={picker.beforeUpload} onRemove={picker.onRemove} accept={acceptOf(ATTACHMENT_LIMIT.kinds)}>
          <Button icon={<UploadIcon size={16} aria-hidden className="text-zinc-500" />}>Chọn tệp</Button>
        </Upload>
        <Button type="primary" loading={isPending} onClick={submit}>
          Gửi bổ sung
        </Button>
      </div>
      <span className="text-xs text-muted">{ATTACHMENT_HINT}</span>
    </div>
  );
}

export function ResubmitModal({ request, open, onClose, onDone, onFail }: { request: RequestView; open: boolean; onClose: () => void; onDone: Done; onFail: Fail }) {
  const [form] = Form.useForm<{ reason: string; keepAttachmentIds: string[] }>();
  const picker = useAttachmentPicker(onFail);
  const [isPending, startTransition] = useTransition();
  return (
    <Modal
      open={open}
      title={`Gửi lại đơn ${request.code}`}
      okText="Gửi lại"
      cancelText="Hủy"
      confirmLoading={isPending}
      mask={{ closable: false }}
      destroyOnHidden
      onCancel={() => {
        picker.clear();
        onClose();
      }}
      onOk={() => form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ reason: request.reason, keepAttachmentIds: request.attachments.map((file) => file.id) }}
        onFinish={(values) =>
          startTransition(async () => {
            const result = await resubmitRequest(requestFormData({ requestId: request.id, ...values }, picker.files)).catch(() => null);
            if (!result) return onFail("Chưa gửi được, kiểm tra kết nối rồi thử lại.");
            if (!result.ok) {
              form.setFields(toFormFields(formErrorsWithoutAttachments(result.fieldErrors)));
              return onFail(result.fieldErrors?.attachments ?? result.message);
            }
            picker.clear();
            onDone(result.data, `Đã gửi lại thành đơn ${result.data.code}`);
          })
        }
      >
        <p className="mb-4 text-sm text-pretty text-muted">Đơn mới giữ nội dung của đơn cũ và đi lại từ bước đầu. Sửa lý do, bổ sung minh chứng theo ý kiến từ chối.</p>
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount />
        </Form.Item>
        {request.attachments.length > 0 && (
          <Form.Item name="keepAttachmentIds" label="Giữ minh chứng của đơn cũ">
            <Checkbox.Group className="flex flex-col gap-1" options={request.attachments.map((file) => ({ value: file.id, label: file.fileName }))} />
          </Form.Item>
        )}
        <Form.Item label="Thêm minh chứng" extra={ATTACHMENT_HINT}>
          <Upload multiple fileList={picker.fileList} beforeUpload={picker.beforeUpload} onRemove={picker.onRemove} accept={acceptOf(ATTACHMENT_LIMIT.kinds)}>
            <Button icon={<UploadIcon size={16} aria-hidden className="text-zinc-500" />}>Chọn tệp</Button>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
}
