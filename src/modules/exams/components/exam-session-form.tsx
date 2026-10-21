"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, message, Select } from "antd";
import type { Dayjs } from "dayjs";
import { Plus, Trash } from "defeat-icons-react";
import { dayjs, formatDateTime, schoolTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { createExamSession, decideProctorSwapRequest, listSectionStudents, updateExamSession } from "@/modules/exams/exams.action";
import { EXAM_FORMAT_OPTIONS, EXAM_KIND_LABEL, EXAM_START_TIMES, MAX_PROCTORS_PER_ROOM, PROCTORS_PER_ROOM } from "@/modules/exams/exams.constant";
import type { ExamClassOption, ExamDeferralRow, ExamFormat, ExamKind, ExamSession } from "@/modules/exams/exams.type";

export type ExamRoomOption = { id: string; code: string; examCapacity: number; isAvailable: boolean };
export type ProctorOption = { id: string; name: string; faculty: string };

type FormValues = {
  classSectionId?: string;
  kind?: ExamKind;
  makeupOfId?: string;
  makeupEnrollmentIds?: string[];
  date: Dayjs;
  startTime: (typeof EXAM_START_TIMES)[number];
  durationMinutes: number;
  format: ExamFormat;
  paperDeadline: Dayjs;
  rooms: { roomId?: string; proctorIds?: string[] }[];
  overrideReason?: string;
};

type ExamSessionFormProps = {
  editing: ExamSession | null;
  open: boolean;
  sessions: ExamSession[];
  classes: ExamClassOption[];
  deferrals: ExamDeferralRow[];
  rooms: ExamRoomOption[];
  proctors: ProctorOption[];
  onClose: () => void;
  onSaved: (exam: ExamSession, isNew: boolean) => void;
};

const startOf = (date: Dayjs, time: string) => schoolTime(`${date.format("YYYY-MM-DD")}T${time}`);

export function ExamSessionForm({ editing, open, sessions, classes, deferrals, rooms, proctors, onClose, onSaved }: ExamSessionFormProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();
  const [isSaving, startSaving] = useTransition();
  const [needsReason, setNeedsReason] = useState(false);
  const [students, setStudents] = useState<{ enrollmentId: string; code: string; fullName: string }[]>([]);
  const classSectionId = Form.useWatch("classSectionId", form);
  const kind = Form.useWatch("kind", form);
  const makeupOfId = Form.useWatch("makeupOfId", form);
  const chosenRooms = Form.useWatch("rooms", form);
  const isNew = editing === null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        date: dayjs(editing.date),
        startTime: editing.startTime as FormValues["startTime"],
        durationMinutes: editing.durationMinutes,
        format: editing.format,
        paperDeadline: dayjs(editing.paperDeadline),
        rooms: editing.rooms.map((room) => ({ roomId: room.roomId, proctorIds: room.proctors.map((proctor) => proctor.id) })),
      });
    } else {
      form.setFieldsValue({ kind: "final", durationMinutes: 90, format: "written", rooms: [{}] });
    }
  }, [open, editing, form]);

  useEffect(() => {
    if (!open || !isNew || kind !== "makeup" || !classSectionId) return;
    let ignore = false;
    void listSectionStudents(classSectionId).then((result) => {
      if (!ignore && result.ok) setStudents(result.data);
    });
    return () => {
      ignore = true;
    };
  }, [open, isNew, kind, classSectionId]);

  useEffect(() => {
    if (!isNew || kind !== "makeup" || !makeupOfId) return;
    const base = sessions.find((session) => session.id === makeupOfId);
    const deferred = deferrals.filter((row) => base && row.kind === base.kind && row.classSectionId === base.classSectionId).map((row) => row.enrollmentId);
    form.setFieldValue("makeupEnrollmentIds", deferred);
  }, [isNew, kind, makeupOfId, sessions, deferrals, form]);

  const moveDeadline = (nextDate: Dayjs | null, nextTime: string | undefined) => {
    const values = form.getFieldsValue();
    const date = nextDate ?? values.date;
    const time = nextTime ?? values.startTime;
    if (!date || !time) return;
    const start = startOf(date, time);
    const deadline = values.paperDeadline;
    if (editing) {
      const delta = start.diff(startOf(dayjs(editing.date), editing.startTime), "minute");
      form.setFieldValue("paperDeadline", dayjs(editing.paperDeadline).add(delta, "minute"));
    } else if (!deadline || !deadline.isBefore(start)) {
      form.setFieldValue("paperDeadline", dayjs(start.subtract(7, "day").hour(17).minute(0).valueOf()));
    }
  };

  const capacity = (chosenRooms ?? []).reduce((sum, room) => sum + (rooms.find((entry) => entry.id === room?.roomId)?.examCapacity ?? 0), 0);
  const section = classes.find((entry) => entry.id === (editing?.classSectionId ?? classSectionId));
  const makeupCount = (Form.useWatch("makeupEnrollmentIds", form) ?? []).length;
  const expected = editing ? editing.expectedCandidates : kind === "makeup" ? makeupCount : (section?.enrolled ?? 0);
  const baseOptions = sessions.filter((session) => session.classSectionId === classSectionId && session.kind !== "makeup");
  const pendingSwaps = editing?.swapRequests.filter((swap) => swap.decision === null) ?? [];

  const submit = (values: FormValues) =>
    startSaving(async () => {
      const slot = {
        date: values.date.format("YYYY-MM-DD"),
        startTime: values.startTime,
        durationMinutes: values.durationMinutes,
        format: values.format,
        paperDeadline: values.paperDeadline.toISOString(),
        rooms: (values.rooms ?? []).map((room) => ({ roomId: room.roomId ?? "", proctorIds: room.proctorIds ?? [] })),
        overrideReason: values.overrideReason ?? null,
      };
      const result = await (editing
        ? updateExamSession({ id: editing.id, ...slot })
        : createExamSession({
            ...slot,
            classSectionId: values.classSectionId ?? "",
            kind: values.kind ?? "final",
            makeupOfId: values.makeupOfId ?? null,
            makeupEnrollmentIds: values.makeupEnrollmentIds ?? [],
          })
      ).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        if (result.fieldErrors?.overrideReason) setNeedsReason(true);
        const { overrideReason: _reason, rooms: roomError, ...fields } = result.fieldErrors ?? {};
        form.setFields(toFormFields(fields));
        messageApi.error(roomError ?? result.message);
        return;
      }
      onSaved(result.data, isNew);
    });

  const decideSwap = (id: string, decision: "accepted" | "rejected") =>
    startSaving(async () => {
      const result = await decideProctorSwapRequest({ id, decision }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      messageApi.success(decision === "accepted" ? "Đã đổi cán bộ coi thi, hai giảng viên nhận thông báo" : "Đã từ chối đề nghị, giảng viên nhận thông báo");
      onSaved(result.data, false);
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={600}
      mask={{ closable: false }}
      destroyOnHidden
      title={editing ? `Ca thi ${EXAM_KIND_LABEL[editing.kind].toLowerCase()} ${editing.classCode}` : "Thêm ca thi"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
            {editing ? "Lưu" : "Tạo ca thi"}
          </Button>
        </div>
      }
    >
      {contextHolder}
      <Form form={form} layout="vertical" onFinish={submit}>
        {editing ? (
          <p className="mb-4 text-sm text-pretty text-muted">
            {editing.courseName}, <span className="tabular-nums">{editing.expectedCandidates}</span> thí sinh
            {editing.status === "published" ? ". Ca đã công bố: lưu thay đổi thì sinh viên, giảng viên và cán bộ coi thi nhận thông báo." : "."}
          </p>
        ) : (
          <>
            <div className="grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Form.Item name="classSectionId" label="Lớp học phần" rules={[{ required: true, message: "Chưa chọn lớp học phần" }]}>
                <Select
                  showSearch={{ optionFilterProp: "label" }}
                  options={classes.map((entry) => ({ value: entry.id, label: `${entry.code} ${entry.courseName} (${entry.enrolled} SV)` }))}
                  onChange={() => form.setFieldsValue({ makeupOfId: undefined, makeupEnrollmentIds: [] })}
                />
              </Form.Item>
              <Form.Item name="kind" label="Loại ca thi" rules={[{ required: true, message: "Chưa chọn loại ca thi" }]}>
                <Select
                  options={(["midterm", "final", "makeup"] as const).map((value) => ({
                    value,
                    label: EXAM_KIND_LABEL[value],
                    disabled: (value === "midterm" && section?.hasMidterm) || (value === "final" && section?.hasFinal),
                  }))}
                />
              </Form.Item>
            </div>
            {kind === "makeup" && (
              <>
                <Form.Item name="makeupOfId" label="Thi bù cho ca" rules={[{ required: true, message: "Chọn ca gốc cần thi bù" }]}>
                  <Select options={baseOptions.map((session) => ({ value: session.id, label: `${EXAM_KIND_LABEL[session.kind]} ${session.classCode}, ${session.date}` }))} notFoundContent="Lớp chưa có ca giữa kỳ, cuối kỳ" />
                </Form.Item>
                <Form.Item name="makeupEnrollmentIds" label="Sinh viên thi bù" rules={[{ required: true, message: "Chọn ít nhất một sinh viên thi bù" }]} extra="Mặc định là sinh viên được hoãn đúng kỳ thi của ca gốc">
                  <Select mode="multiple" showSearch={{ optionFilterProp: "label" }} options={students.map((student) => ({ value: student.enrollmentId, label: `${student.fullName} (${student.code})` }))} />
                </Form.Item>
              </>
            )}
          </>
        )}
        {pendingSwaps.map((swap) => (
          <Alert
            key={swap.id}
            type="warning"
            showIcon
            className="mb-4"
            title={`${swap.requesterName} đề nghị đổi cho ${swap.substituteName}`}
            description={
              <span className="flex flex-col gap-2">
                <span className="text-pretty">{swap.reason}</span>
                <span className="flex gap-2">
                  <Button size="small" onClick={() => decideSwap(swap.id, "rejected")} disabled={isSaving}>
                    Từ chối
                  </Button>
                  <Button size="small" type="primary" onClick={() => decideSwap(swap.id, "accepted")} disabled={isSaving}>
                    Đồng ý đổi
                  </Button>
                </span>
              </span>
            }
          />
        ))}
        <div className="grid gap-x-3 sm:grid-cols-3">
          <Form.Item name="date" label="Ngày thi" rules={[{ required: true, message: "Chưa chọn ngày" }]}>
            <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" className="w-full" disabledDate={(date) => date.day() === 0 || date.isBefore(dayjs().startOf("day"))} onChange={(value) => moveDeadline(value, undefined)} />
          </Form.Item>
          <Form.Item name="startTime" label="Giờ bắt đầu" rules={[{ required: true, message: "Chưa chọn giờ" }]}>
            <Select options={EXAM_START_TIMES.map((value) => ({ value, label: value }))} onChange={(value: FormValues["startTime"]) => moveDeadline(null, value)} />
          </Form.Item>
          <Form.Item name="durationMinutes" label="Thời lượng (phút)" rules={[{ required: true, message: "Nhập thời lượng" }]}>
            <InputNumber min={15} max={240} step={15} className="w-full" />
          </Form.Item>
        </div>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="format" label="Hình thức" rules={[{ required: true, message: "Chưa chọn hình thức" }]}>
            <Select options={EXAM_FORMAT_OPTIONS} />
          </Form.Item>
          <Form.Item name="paperDeadline" label="Hạn nộp đề" rules={[{ required: true, message: "Chọn hạn nộp đề" }]} extra="Tự dời theo ngày thi; phải trước giờ thi">
            <DatePicker showTime={{ format: "HH:mm" }} format="HH:mm DD/MM/YYYY" className="w-full" />
          </Form.Item>
        </div>
        <Form.List name="rooms">
          {(fields, { add, remove }) => (
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">Phòng thi và cán bộ coi thi</span>
                <span className={`text-xs tabular-nums ${capacity < expected ? "text-rose-700" : "text-muted"}`}>
                  {capacity} chỗ ngồi thi / {expected} thí sinh
                </span>
              </div>
              {fields.map((field, index) => (
                <div key={field.key} className="grid gap-x-3 rounded-lg border border-border-strong p-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
                  <Form.Item name={[field.name, "roomId"]} label={`Phòng ${index + 1}`} rules={[{ required: true, message: "Chọn phòng" }]} className="mb-2 sm:mb-0">
                    <Select
                      showSearch={{ optionFilterProp: "label" }}
                      options={rooms.map((room) => ({ value: room.id, disabled: !room.isAvailable, label: `${room.code} (${room.examCapacity} chỗ)${room.isAvailable ? "" : ", bảo trì"}` }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "proctorIds"]}
                    label="Cán bộ coi thi"
                    className="mb-0"
                    rules={[{ validator: (_, value: string[] = []) => (value.length >= PROCTORS_PER_ROOM ? Promise.resolve() : Promise.reject(new Error(`Cần ít nhất ${PROCTORS_PER_ROOM} cán bộ coi thi`))) }]}
                  >
                    <Select mode="multiple" maxCount={MAX_PROCTORS_PER_ROOM} showSearch={{ optionFilterProp: "label" }} options={proctors.map((proctor) => ({ value: proctor.id, label: `${proctor.name}, ${proctor.faculty}` }))} />
                  </Form.Item>
                  <Button type="text" aria-label={`Bỏ phòng ${index + 1}`} icon={<Trash size={16} aria-hidden className="text-zinc-500" />} onClick={() => remove(field.name)} disabled={fields.length === 1} className="self-end" />
                </div>
              ))}
              <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => add({})} className="self-start">
                Thêm phòng
              </Button>
            </div>
          )}
        </Form.List>
        {needsReason && (
          <Form.Item name="overrideReason" label="Lý do vẫn xếp lịch này" rules={[{ required: true, whitespace: true, message: "Ghi lý do để bỏ qua cảnh báo" }]} extra="Trùng lịch thi của sinh viên hoặc giờ dạy của cán bộ coi thi; lý do được ghi vào nhật ký">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={300} showCount />
          </Form.Item>
        )}
        {editing && editing.swapRequests.some((swap) => swap.decision !== null) && (
          <div className="flex flex-col gap-1 text-xs text-muted">
            <span className="font-medium">Lịch sử đổi ca</span>
            {editing.swapRequests
              .filter((swap) => swap.decision !== null)
              .map((swap) => (
                <span key={swap.id} className="text-pretty">
                  {formatDateTime(swap.createdAt)}: {swap.requesterName} xin đổi cho {swap.substituteName}.{" "}
                  {swap.decision === "accepted" ? "Đã đổi" : swap.decision === "rejected" ? "Không đồng ý" : "Hết hiệu lực"}
                  {swap.resolveNote ? ` (${swap.resolveNote})` : ""}
                </span>
              ))}
          </div>
        )}
      </Form>
    </Drawer>
  );
}
