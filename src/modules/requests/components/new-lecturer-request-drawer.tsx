"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Form, Input, InputNumber, Segmented, Select, Upload } from "antd";
import { Paperclip } from "defeat-icons-react";
import { PERIODS, periodLabel, periodTimeRange, WEEKDAYS, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, formatDate, weekdayOf } from "@/shared/libs/date.lib";
import { LECTURER_REQUEST_KINDS, REQUEST_KINDS } from "../requests.constant";
import type { AcademicRequest, ApprovalStep, RequestKind } from "../requests.type";

export type RequestMeeting = {
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  room: string;
};

export type RequestClassOption = {
  id: string;
  code: string;
  courseName: string;
  meetings: RequestMeeting[];
  endDate: string;
  students: { studentId: string; studentCode: string; fullName: string }[];
  components: { key: string; label: string }[];
  scores: Record<string, Record<string, number | null>>;
};

export type BusySlot = RequestMeeting & { code: string };

export type LecturerRequestPrefill = {
  kind: RequestKind;
  classId?: string;
  studentId?: string;
  componentKey?: string;
};

type Requester = { id: string; name: string; code: string; unit: string };

type NewLecturerRequestDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (request: AcademicRequest) => void;
  classes: RequestClassOption[];
  busySlots: BusySlot[];
  rooms: string[];
  requester: Requester;
  prefill?: LecturerRequestPrefill;
};

type FormValues = {
  classId?: string;
  studentId?: string;
  componentKey?: string;
  newScore?: number;
  sessionDate?: string;
  makeupDay?: number;
  makeupStart?: number;
  makeupEnd?: number;
  makeupRoom?: string;
  reason?: string;
};

const PERIOD_OPTIONS = PERIODS.map((period) => ({ value: period.period, label: `Tiết ${period.period} (${period.start})` }));

function overlaps(a: { dayOfWeek: number; startPeriod: number; endPeriod: number }, b: { dayOfWeek: number; startPeriod: number; endPeriod: number }) {
  return a.dayOfWeek === b.dayOfWeek && a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod;
}

function upcomingSessions(option: RequestClassOption) {
  const sessions: { value: string; label: string; meeting: RequestMeeting }[] = [];
  const end = dayjs(option.endDate);
  for (let date = dayjs().startOf("day").add(1, "day"); sessions.length < 8 && !date.isAfter(end); date = date.add(1, "day")) {
    for (const meeting of option.meetings) {
      if (weekdayOf(date) !== meeting.dayOfWeek) continue;
      sessions.push({
        value: `${date.format("YYYY-MM-DD")}|${meeting.startPeriod}`,
        label: `${weekdayLabel(meeting.dayOfWeek)}, ${formatDate(date)}, ${periodLabel(meeting.startPeriod, meeting.endPeriod)}, phòng ${meeting.room}`,
        meeting,
      });
    }
  }
  return sessions;
}

function suggestSlot(busySlots: BusySlot[], length: number) {
  for (const day of [7, 8, 2, 3, 4, 5, 6]) {
    for (let start = 1; start + length - 1 <= PERIODS.length; start += 1) {
      const candidate = { dayOfWeek: day, startPeriod: start, endPeriod: start + length - 1 };
      if (!busySlots.some((slot) => overlaps(slot, candidate))) return candidate;
    }
  }
  return null;
}

function buildSteps(kind: RequestKind): ApprovalStep[] {
  return REQUEST_KINDS[kind].steps.map((template, index) => ({
    role: template.role,
    label: template.label,
    assigneeId: null,
    assigneeName: template.role === "faculty" ? "Trưởng khoa" : "Phòng Đào tạo",
    status: index === 0 ? "pending" : "waiting",
    actorName: null,
    actedAt: null,
    comment: null,
    dueAt: index === 0 ? dayjs().add(template.slaDays, "day").toISOString() : null,
  }));
}

export function NewLecturerRequestDrawer({ open, onClose, onCreated, classes, busySlots, rooms, requester, prefill }: NewLecturerRequestDrawerProps) {
  const [form] = Form.useForm<FormValues>();
  const [kind, setKind] = useState<RequestKind>(prefill?.kind ?? "grade-change");
  const [files, setFiles] = useState<string[]>([]);
  const values = Form.useWatch([], form) ?? {};

  const prefillKind = prefill?.kind;
  const prefillClassId = prefill?.classId;
  const prefillStudentId = prefill?.studentId;
  const prefillComponentKey = prefill?.componentKey;

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(prefillKind ?? "grade-change");
      setFiles([]);
    }
  }

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ classId: prefillClassId, studentId: prefillStudentId, componentKey: prefillComponentKey });
  }, [open, prefillClassId, prefillStudentId, prefillComponentKey, form]);

  const selectedClass = classes.find((option) => option.id === values.classId);
  const oldScore =
    selectedClass && values.studentId && values.componentKey ? (selectedClass.scores[values.studentId]?.[values.componentKey] ?? null) : null;
  const sessions = selectedClass ? upcomingSessions(selectedClass) : [];
  const session = sessions.find((entry) => entry.value === values.sessionDate);

  const makeup =
    values.makeupDay && values.makeupStart && values.makeupEnd
      ? { dayOfWeek: values.makeupDay, startPeriod: values.makeupStart, endPeriod: values.makeupEnd }
      : null;
  const makeupConflicts = makeup ? busySlots.filter((slot) => overlaps(slot, makeup)) : [];
  const invalidRange = makeup ? makeup.endPeriod < makeup.startPeriod : false;

  const applySuggestion = () => {
    const length = session ? session.meeting.endPeriod - session.meeting.startPeriod + 1 : 3;
    const slot = suggestSlot(busySlots, length);
    if (!slot) return;
    form.setFieldsValue({ makeupDay: slot.dayOfWeek, makeupStart: slot.startPeriod, makeupEnd: slot.endPeriod, makeupRoom: form.getFieldValue("makeupRoom") ?? session?.meeting.room });
  };

  const submit = (formValues: FormValues) => {
    const option = classes.find((entry) => entry.id === formValues.classId)!;
    let subject = "";
    let details: { label: string; value: string }[] = [];
    if (kind === "grade-change") {
      const student = option.students.find((entry) => entry.studentId === formValues.studentId)!;
      const component = option.components.find((entry) => entry.key === formValues.componentKey)!;
      subject = `${option.code} ${option.courseName}`;
      details = [
        { label: "Sinh viên", value: `${student.fullName}, ${student.studentCode}` },
        { label: "Cột điểm", value: component.label },
        { label: "Điểm cũ", value: oldScore === null ? "Chưa có" : oldScore.toFixed(2).replace(".", ",") },
        { label: "Điểm mới", value: (formValues.newScore ?? 0).toFixed(2).replace(".", ",") },
      ];
    } else {
      const chosen = sessions.find((entry) => entry.value === formValues.sessionDate)!;
      subject = `${option.code}, ${chosen.label.split(",").slice(0, 2).join(",")}`;
      details = [
        { label: "Buổi nghỉ", value: chosen.label },
        {
          label: "Dạy bù",
          value: `${weekdayLabel(formValues.makeupDay!)}, ${periodLabel(formValues.makeupStart!, formValues.makeupEnd!)} (${periodTimeRange(formValues.makeupStart!, formValues.makeupEnd!)}), đề xuất phòng ${formValues.makeupRoom}`,
        },
      ];
    }
    const request: AcademicRequest = {
      id: `don-moi-${dayjs().valueOf()}`,
      code: `GV-${dayjs().year()}-${String(dayjs().valueOf()).slice(-5)}`,
      kind,
      requesterType: "lecturer",
      requesterId: requester.id,
      requesterName: requester.name,
      requesterCode: requester.code,
      requesterUnit: requester.unit,
      faculty: requester.unit,
      subject,
      details,
      reason: formValues.reason ?? "",
      attachments: files,
      createdAt: dayjs().toISOString(),
      cancelledAt: null,
      steps: buildSteps(kind),
    };
    onCreated(request);
  };

  const blocked = kind === "teaching-leave" && (makeupConflicts.length > 0 || invalidRange);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={560}
      destroyOnHidden
      mask={{ closable: false }}
      title="Tạo đơn"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" disabled={blocked} onClick={() => form.submit()}>
            Gửi đơn
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented<RequestKind>
          block
          value={kind}
          onChange={(value) => {
            setKind(value);
            form.resetFields(["studentId", "componentKey", "newScore", "sessionDate", "makeupDay", "makeupStart", "makeupEnd", "makeupRoom"]);
          }}
          options={LECTURER_REQUEST_KINDS.map((value) => ({ value, label: REQUEST_KINDS[value].label }))}
        />
        <p className="text-sm text-pretty text-muted">{REQUEST_KINDS[kind].description}</p>
        <p className="text-xs text-muted">
          Quy trình: {REQUEST_KINDS[kind].steps.map((step) => step.label).join(", sau đó ")}.
        </p>

        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="classId" label="Lớp học phần" rules={[{ required: true, message: "Chưa chọn lớp" }]}>
            <Select
              options={classes.map((option) => ({ value: option.id, label: `${option.code} ${option.courseName}` }))}
              onChange={() => form.resetFields(["studentId", "componentKey", "sessionDate"])}
            />
          </Form.Item>

          {kind === "grade-change" ? (
            <>
              <Form.Item name="studentId" label="Sinh viên" rules={[{ required: true, message: "Chưa chọn sinh viên" }]}>
                <Select
                  showSearch={{ optionFilterProp: "label" }}
                  disabled={!selectedClass}
                  options={(selectedClass?.students ?? []).map((student) => ({ value: student.studentId, label: `${student.fullName} (${student.studentCode})` }))}
                />
              </Form.Item>
              <div className="grid gap-x-3 sm:grid-cols-2">
                <Form.Item name="componentKey" label="Cột điểm" rules={[{ required: true, message: "Chưa chọn cột điểm" }]}>
                  <Select disabled={!selectedClass} options={(selectedClass?.components ?? []).map((component) => ({ value: component.key, label: component.label }))} />
                </Form.Item>
                <Form.Item
                  name="newScore"
                  label="Điểm mới"
                  extra={values.componentKey && values.studentId ? `Điểm hiện tại: ${oldScore === null ? "chưa có" : oldScore.toFixed(2).replace(".", ",")}` : undefined}
                  rules={[
                    { required: true, message: "Chưa nhập điểm mới" },
                    {
                      validator: (_, value) =>
                        value !== undefined && oldScore !== null && value === oldScore ? Promise.reject(new Error("Điểm mới trùng điểm hiện tại")) : Promise.resolve(),
                    },
                  ]}
                >
                  <InputNumber min={0} max={10} step={0.25} precision={2} decimalSeparator="," className="w-full tabular-nums" />
                </Form.Item>
              </div>
            </>
          ) : (
            <>
              <Form.Item name="sessionDate" label="Buổi xin nghỉ" rules={[{ required: true, message: "Chưa chọn buổi nghỉ" }]}>
                <Select
                  disabled={!selectedClass}
                  options={sessions.map((entry) => ({ value: entry.value, label: entry.label }))}
                  notFoundContent="Lớp không còn buổi học nào trong học kỳ"
                />
              </Form.Item>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Lịch dạy bù</span>
                <Button size="small" onClick={applySuggestion}>
                  Gợi ý giờ trống
                </Button>
              </div>
              <div className="mt-2 grid gap-x-3 sm:grid-cols-3">
                <Form.Item name="makeupDay" label="Thứ" rules={[{ required: true, message: "Chọn thứ" }]}>
                  <Select options={WEEKDAYS.map((day) => ({ value: day.value, label: day.label }))} />
                </Form.Item>
                <Form.Item name="makeupStart" label="Từ tiết" rules={[{ required: true, message: "Chọn tiết" }]}>
                  <Select options={PERIOD_OPTIONS} />
                </Form.Item>
                <Form.Item name="makeupEnd" label="Đến tiết" rules={[{ required: true, message: "Chọn tiết" }]}>
                  <Select options={PERIOD_OPTIONS} />
                </Form.Item>
              </div>
              <Form.Item name="makeupRoom" label="Phòng đề xuất" rules={[{ required: true, message: "Chọn phòng" }]}>
                <Select showSearch={{ optionFilterProp: "label" }} options={rooms.map((room) => ({ value: room, label: room }))} />
              </Form.Item>
              {invalidRange && <Alert type="error" showIcon title="Tiết kết thúc đứng trước tiết bắt đầu" className="mb-4" />}
              {makeupConflicts.length > 0 && (
                <Alert
                  type="error"
                  showIcon
                  className="mb-4"
                  title="Giờ dạy bù trùng lịch dạy của bạn"
                  description={`Trùng ${makeupConflicts.map((slot) => `${slot.code} (${weekdayLabel(slot.dayOfWeek)}, ${periodLabel(slot.startPeriod, slot.endPeriod)})`).join(", ")}. Chọn giờ khác hoặc bấm Gợi ý giờ trống.`}
                />
              )}
              {makeup && !invalidRange && makeupConflicts.length === 0 && (
                <p className="mb-4 text-xs text-green-700">Không trùng lịch dạy của bạn. Phòng Đào tạo sẽ xác nhận phòng trống.</p>
              )}
            </>
          )}

          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} showCount />
          </Form.Item>
          <Form.Item label="Minh chứng" extra={kind === "grade-change" ? "Biên bản chấm, bài thi đã scan hoặc ảnh bảng điểm gốc" : "Giấy mời, quyết định cử đi công tác"}>
            <Upload
              multiple
              beforeUpload={(file) => {
                setFiles((current) => [...current, file.name]);
                return false;
              }}
              onRemove={(file) => setFiles((current) => current.filter((name) => name !== file.name))}
            >
              <Button icon={<Paperclip size={16} aria-hidden />}>Đính kèm tệp</Button>
            </Upload>
          </Form.Item>
        </Form>
      </div>
    </Drawer>
  );
}
