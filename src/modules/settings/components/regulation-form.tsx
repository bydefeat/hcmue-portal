"use client";

import { useState, useTransition } from "react";
import { Button, Card, DatePicker, Form, Input, InputNumber, message, Modal, Select, Switch, Table } from "antd";
import type { Dayjs } from "dayjs";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { saveRegulation } from "@/modules/settings/settings.action";
import { CEFR_LEVELS, DISCIPLINE_LEVEL_LABEL, DISCIPLINE_LEVELS, RANKED_STANDING_LABEL, ROUNDING_STEPS } from "@/modules/settings/settings.constant";
import type { RegulationSettings, RegulationVersion } from "@/modules/settings/settings.type";
import { SectionCard } from "@/shared/components/ui/section-card";

type RegulationFormProps = {
  regulation: RegulationSettings;
  versions: RegulationVersion[];
};

type SaveValues = { decision: string; reason: string; effectiveFrom: Dayjs };

const SAVE_FIELDS = new Set(["decision", "reason", "effectiveFrom"]);

// Lỗi theo ô từ server: "rules.credits.maxPerTerm" → ô ["credits", "maxPerTerm"] của form quy chế, còn lại thuộc hộp xác nhận.
function splitFieldErrors(fieldErrors: Record<string, string> | undefined) {
  const rules: { name: (string | number)[]; errors: string[] }[] = [];
  const save: { name: keyof SaveValues; errors: string[] }[] = [];
  for (const [path, error] of Object.entries(fieldErrors ?? {})) {
    if (SAVE_FIELDS.has(path)) save.push({ name: path as keyof SaveValues, errors: [error] });
    else if (path.startsWith("rules.")) rules.push({ name: path.slice(6).split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part)), errors: [error] });
  }
  return { rules, save };
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 max-w-prose text-sm text-pretty text-muted">{children}</p>;
}

function NumberField({
  name,
  label,
  min,
  max,
  step = 1,
  suffix,
  extra,
}: {
  name: (string | number)[];
  label: string;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  extra?: string;
}) {
  return (
    <Form.Item name={name} label={label} extra={extra} rules={[{ required: true, message: `Chưa nhập ${label.toLowerCase()}` }]}>
      <InputNumber min={min} max={max} step={step} decimalSeparator="," suffix={suffix} className="w-full tabular-nums" />
    </Form.Item>
  );
}

export function RegulationForm({ regulation, versions }: RegulationFormProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<RegulationSettings>();
  const [saveForm] = Form.useForm<SaveValues>();
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [current, setCurrent] = useState(regulation);
  const [history, setHistory] = useState(versions);
  const [isSaving, startSaving] = useTransition();

  const submit = async () => {
    try {
      await form.validateFields();
      const scale = form.getFieldValue(["grading", "scale"]) as RegulationSettings["grading"]["scale"];
      const sorted = scale.every((step, index) => index === 0 || step.min < scale[index - 1].min);
      if (!sorted) {
        messageApi.error("Thang điểm chữ phải xếp ngưỡng giảm dần từ A đến F. Kiểm tra lại cột Từ điểm.");
        return;
      }
      saveForm.resetFields();
      setConfirmOpen(true);
    } catch {
      messageApi.error("Còn trường chưa hợp lệ, xem các ô có viền đỏ.");
    }
  };

  const save = (values: SaveValues) =>
    startSaving(async () => {
      const { grading, credits, warning, attendance, workflow, graduation } = form.getFieldsValue(true) as RegulationSettings;
      const result = await saveRegulation({
        rules: { grading, credits, warning, attendance, workflow, graduation },
        decision: values.decision,
        reason: values.reason,
        effectiveFrom: values.effectiveFrom.format("YYYY-MM-DD"),
      }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        const { rules, save: saveErrors } = splitFieldErrors(result.fieldErrors);
        if (rules.length > 0) {
          form.setFields(rules as never);
          setConfirmOpen(false);
        }
        saveForm.setFields(saveErrors);
        messageApi.error(result.message);
        return;
      }
      setCurrent(result.data.regulation);
      setHistory(result.data.versions);
      form.setFieldsValue(result.data.regulation);
      setIsDirty(false);
      setConfirmOpen(false);
      messageApi.success(`Đã lưu quy chế ${result.data.regulation.version}, áp dụng từ ${values.effectiveFrom.format("DD/MM/YYYY")}. Thay đổi được ghi vào nhật ký thao tác.`);
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start sm:gap-6">
      {contextHolder}
      <Form form={form} layout="vertical" initialValues={regulation} onValuesChange={() => setIsDirty(true)} className="flex min-w-0 flex-col gap-4">
        <SectionCard title="Thang điểm">
          <SectionDescription>Quy đổi điểm học phần từ thang 10 sang điểm chữ và thang 4. Ngưỡng là điểm thấp nhất để đạt mức đó.</SectionDescription>
          <Form.List name={["grading", "scale"]}>
            {(fields) => (
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={fields}
                scroll={{ x: 280 }}
                className="mb-4"
                columns={[
                  {
                    title: "Điểm chữ",
                    key: "letter",
                    width: 72,
                    render: (_, field) => (
                      <Form.Item name={[field.name, "letter"]} noStyle>
                        <Input readOnly variant="borderless" className="w-16 px-0 font-medium" />
                      </Form.Item>
                    ),
                  },
                  {
                    title: "Từ điểm (thang 10)",
                    key: "min",
                    render: (_, field) => (
                      <Form.Item name={[field.name, "min"]} className="mb-0" rules={[{ required: true, message: "Chưa nhập" }]}>
                        <InputNumber min={0} max={10} step={0.5} decimalSeparator="," className="w-full max-w-28 tabular-nums" />
                      </Form.Item>
                    ),
                  },
                  {
                    title: "Thang 4",
                    key: "point4",
                    render: (_, field) => (
                      <Form.Item name={[field.name, "point4"]} className="mb-0" rules={[{ required: true, message: "Chưa nhập" }]}>
                        <InputNumber min={0} max={4} step={0.5} decimalSeparator="," className="w-full max-w-28 tabular-nums" />
                      </Form.Item>
                    ),
                  },
                ]}
              />
            )}
          </Form.List>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Form.Item name={["grading", "roundingStep"]} label="Làm tròn điểm học phần đến" extra="Điểm tổng kết làm tròn theo bước này rồi mới quy đổi điểm chữ; điểm dưới mức D là F (không đạt).">
              <Select options={ROUNDING_STEPS.map((step) => ({ value: step, label: String(step).replace(".", ",") }))} className="w-full" />
            </Form.Item>
            <NumberField
              name={["grading", "incompleteTerms"]}
              label="Điểm I chuyển F sau"
              min={1}
              max={4}
              suffix="học kỳ"
              extra="Sinh viên được hoãn thi nhận điểm I khi công bố điểm; quá số học kỳ này mà chưa thi bù thì I chuyển F."
            />
          </div>
        </SectionCard>

        <SectionCard title="Xếp loại học lực và tốt nghiệp">
          <SectionDescription>CPA thang 4 thấp nhất của từng mức. Sinh viên chưa có điểm học phần nào là Chưa xếp loại; tốt nghiệp cần CPA từ mức Trung bình.</SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["grading", "standing", "excellent"]} label="Xuất sắc từ" min={0} max={4} step={0.1} />
            <NumberField name={["grading", "standing", "veryGood"]} label="Giỏi từ" min={0} max={4} step={0.1} />
            <NumberField name={["grading", "standing", "good"]} label="Khá từ" min={0} max={4} step={0.1} />
            <NumberField name={["grading", "standing", "average"]} label="Trung bình từ" min={0} max={4} step={0.1} />
            <NumberField name={["grading", "standing", "weak"]} label="Yếu từ (dưới là Kém)" min={0} max={4} step={0.1} />
          </div>
        </SectionCard>

        <SectionCard title="Hạn mức tín chỉ">
          <SectionDescription>
            Áp dụng khi kiểm tra đăng ký học phần và kế hoạch học tập. Học kỳ hè không bắt buộc số tín chỉ tối thiểu. Sinh viên đang bị cảnh báo học vụ (cảnh báo đã gửi của học kỳ gần nhất) dùng hạn mức riêng.
          </SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["credits", "minPerTerm"]} label="Tối thiểu mỗi học kỳ" min={0} max={30} suffix="TC" />
            <NumberField name={["credits", "maxPerTerm"]} label="Tối đa mỗi học kỳ" min={1} max={40} suffix="TC" />
            <NumberField name={["credits", "maxSummer"]} label="Tối đa học kỳ hè" min={0} max={20} suffix="TC" />
            <NumberField name={["credits", "maxWhenWarned"]} label="Tối đa khi bị cảnh báo" min={0} max={30} suffix="TC" />
            <NumberField name={["credits", "overloadMinCpa"]} label="CPA tối thiểu để học vượt" min={0} max={4} step={0.1} />
            <NumberField name={["credits", "overloadExtraCredits"]} label="Học vượt tối đa thêm" min={1} max={15} suffix="TC" />
          </div>
        </SectionCard>

        <SectionCard title="Cảnh báo học vụ">
          <SectionDescription>
            Xét sau mỗi học kỳ chính theo các ngưỡng dưới đây; nợ tín chỉ tính theo lần học cuối của từng học phần. Bị cảnh báo đủ số học kỳ liên tiếp thì sinh viên vào danh sách đề xuất xét buộc
            thôi học.
          </SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["warning", "level1TermGpa"]} label="Mức 1: ĐTB học kỳ dưới" min={0} max={4} step={0.1} />
            <NumberField name={["warning", "level1FailedCredits"]} label="Mức 1: nợ từ" min={0} max={60} suffix="TC" />
            <NumberField name={["warning", "level2Cpa"]} label="Mức 2: CPA dưới" min={0} max={4} step={0.1} />
            <NumberField name={["warning", "level2FailedCredits"]} label="Mức 2: nợ từ" min={0} max={60} suffix="TC" />
            <NumberField name={["warning", "level3Cpa"]} label="Mức 3: CPA dưới" min={0} max={4} step={0.1} />
            <NumberField name={["warning", "expelAfterWarnings"]} label="Đề xuất thôi học khi cảnh báo liên tiếp" min={1} max={6} suffix="học kỳ" />
          </div>
        </SectionCard>

        <SectionCard title="Chuyên cần và thời hạn xử lý">
          <SectionDescription>Hạn nhập điểm tính từ ngày thi cuối kỳ của lớp, lớp chưa có lịch thi thì từ ngày kết thúc học kỳ. Các thời hạn khác tính từ khi việc đến lượt người xử lý.</SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["attendance", "absenceLimitPercent"]} label="Vắng quá thì cấm thi" min={0} max={100} suffix="%" />
            <NumberField name={["workflow", "gradeEntryDays"]} label="Hạn nhập điểm sau ngày thi" min={1} max={30} suffix="ngày" />
            <NumberField name={["workflow", "gradeDueSoonDays"]} label="Nhắc sắp hết hạn trước" min={1} max={14} suffix="ngày" />
            <NumberField name={["workflow", "studyPlanReviewDays"]} label="Cố vấn duyệt kế hoạch trong" min={1} max={14} suffix="ngày" />
            <NumberField name={["workflow", "regradeWindowDays"]} label="Nhận đơn phúc khảo trong" min={1} max={30} suffix="ngày" />
            <NumberField name={["workflow", "registrationClosingSoonHours"]} label="Báo đợt sắp đóng trước" min={1} max={168} suffix="giờ" />
            <NumberField name={["workflow", "withdrawDeadlineWeeks"]} label="Hạn rút học phần (nhận W)" min={1} max={20} suffix="tuần từ đầu học kỳ" />
            <NumberField name={["workflow", "maxReserveTerms"]} label="Bảo lưu tối đa" min={1} max={8} suffix="học kỳ" />
          </div>
        </SectionCard>

        <SectionCard title="Xét tốt nghiệp">
          <SectionDescription>Hạng tốt nghiệp theo CPA, bị giảm một mức nếu khối lượng học lại vượt tỉ lệ dưới đây hoặc bị kỷ luật từ mức đã chọn trong thời gian học.</SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["graduation", "retakeLimitPercent"]} label="Học lại vượt quá" min={0} max={100} step={0.5} suffix="% tín chỉ" />
            <Form.Item name={["graduation", "downgradeDisciplineLevel"]} label="Kỷ luật từ mức">
              <Select options={DISCIPLINE_LEVELS.map((level) => ({ value: level, label: DISCIPLINE_LEVEL_LABEL[level] }))} className="w-full" />
            </Form.Item>
            <Form.Item name={["graduation", "downgradeStandings"]} label="Hạng bị giảm">
              <Select mode="multiple" options={Object.entries(RANKED_STANDING_LABEL).map(([value, label]) => ({ value, label }))} className="w-full" />
            </Form.Item>
            <Form.Item name={["graduation", "languageMinLevel"]} label="Chuẩn ngoại ngữ tối thiểu" extra="Bậc theo khung tham chiếu châu Âu (bậc 3 của Việt Nam là B1).">
              <Select options={CEFR_LEVELS.map((level) => ({ value: level, label: level }))} className="w-full" />
            </Form.Item>
            <Form.Item name={["graduation", "requireItCertificate"]} label="Bắt buộc chứng chỉ tin học" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </SectionCard>

        <Card size="small" className="sticky bottom-[calc(74px+env(safe-area-inset-bottom))] z-10 lg:bottom-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isDirty ? <StatusTag status={{ label: "Có thay đổi chưa lưu", tone: "warning" }} /> : <span className="text-xs text-muted">Không có thay đổi</span>}
            <Button
              disabled={!isDirty}
              onClick={() => {
                form.setFieldsValue(current);
                setIsDirty(false);
              }}
            >
              Hoàn tác
            </Button>
            <Button type="primary" disabled={!isDirty} onClick={submit}>
              Lưu quy chế
            </Button>
          </div>
        </Card>
      </Form>

      <aside className="flex flex-col gap-4">
        <SectionCard title="Phiên bản mới nhất">
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              {current.version}, áp dụng từ <span className="tabular-nums">{formatDate(current.effectiveFrom)}</span>
            </p>
            <p className="text-xs text-muted tabular-nums">
              Sửa lần cuối {formatDateTime(current.updatedAt)} bởi {current.updatedBy}
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Lịch sử quy chế">
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-3">
              {history.map((version) => (
                <li key={version.version} className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {version.version} · Quyết định {version.decision}
                  </span>
                  <span className="text-xs text-muted tabular-nums">Áp dụng từ {formatDate(version.effectiveFrom)}</span>
                  <span className="text-sm text-pretty text-muted">{version.summary}</span>
                </li>
              ))}
            </ol>
          </div>
        </SectionCard>
      </aside>

      <Modal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        title="Lưu thay đổi quy chế"
        okText="Lưu quy chế"
        cancelText="Hủy"
        okButtonProps={{ loading: isSaving }}
        onOk={() => saveForm.submit()}
        mask={{ closable: false }}
        destroyOnHidden
        width={480}
      >
        <p className="mb-4 text-sm text-pretty text-muted">
          Quy chế mới ảnh hưởng đến xét cảnh báo, đăng ký học phần và quy đổi điểm của toàn trường. Ghi rõ căn cứ để lưu vào nhật ký.
        </p>
        <Form form={saveForm} layout="vertical" onFinish={save}>
          <Form.Item name="decision" label="Số quyết định ban hành" rules={[{ required: true, whitespace: true, message: "Chưa nhập số quyết định" }]}>
            <Input maxLength={60} placeholder="Ví dụ: 2412/QĐ-ĐHSP" />
          </Form.Item>
          <Form.Item name="reason" label="Căn cứ, lý do thay đổi" rules={[{ required: true, whitespace: true, message: "Chưa nhập căn cứ thay đổi" }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={300} showCount className="mb-2" />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Áp dụng từ ngày" rules={[{ required: true, message: "Chưa chọn ngày áp dụng" }]}>
            <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" className="w-full" disabledDate={(date) => date.isBefore(dayjs().startOf("day"))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
