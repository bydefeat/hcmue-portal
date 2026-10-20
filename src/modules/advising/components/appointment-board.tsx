"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AutoComplete, Button, Card, DatePicker, Drawer, Form, Input, message, Modal, Radio, Segmented, Select, TimePicker } from "antd";
import { Notes, Plus } from "defeat-icons-react";
import type { Dayjs } from "dayjs";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, formatDate, formatDateTime, weekdayOf } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { cancelAppointment, createAppointment, moveAppointment, recordAppointment } from "@/modules/advising/advising.action";
import { appointmentStart, appointmentsOverlap, splitAppointments } from "@/modules/advising/advising.rule";
import { APPOINTMENT_DURATIONS, APPOINTMENT_MODE_LABEL, APPOINTMENT_STATUS, APPOINTMENT_TOPICS } from "@/modules/advising/advising.constant";
import type { Appointment, AppointmentMode, AppointmentStudent, MeetingNote } from "@/modules/advising/advising.type";

type AppointmentBoardProps = {
  appointments: Appointment[];
  advisees: AppointmentStudent[];
  notes: MeetingNote[];
};

type View = "upcoming" | "past";

type CreateValues = {
  studentIds: string[];
  topic: string;
  date: Dayjs;
  time: Dayjs;
  durationMinutes: number;
  mode: AppointmentMode;
  location: string;
};

type DoneValues = { attendance: Record<string, "present" | "absent">; note?: string; followUp?: string };

type MoveValues = { date: Dayjs; time: Dayjs; durationMinutes: number; location: string };

const DEFAULT_LOCATION: Record<AppointmentMode, string> = {
  "in-person": "Văn phòng khoa, phòng B.201",
  online: "Google Meet",
};

const startOf = appointmentStart;

function dayText(date: string) {
  const diff = dayjs(date).startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  return `${weekdayLabel(weekdayOf(date))}, ${formatDate(date)}`;
}

export function AppointmentBoard({ appointments, advisees, notes: initialNotes }: AppointmentBoardProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(appointments);
  const [notes, setNotes] = useState(initialNotes);
  const [view, setView] = useState<View>("upcoming");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [completing, setCompleting] = useState<Appointment | null>(null);
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [moveForm] = Form.useForm<MoveValues>();
  const [isSaving, startSaving] = useTransition();
  const [createForm] = Form.useForm<CreateValues>();
  const [doneForm] = Form.useForm<DoneValues>();
  const watched = Form.useWatch([], createForm) as Partial<CreateValues> | undefined;

  useEffect(() => {
    if (!isCreateOpen) return;
    createForm.resetFields();
    createForm.setFieldsValue({ durationMinutes: 30, mode: "in-person", location: DEFAULT_LOCATION["in-person"] });
  }, [isCreateOpen, createForm]);

  const now = dayjs();
  const { upcoming, past } = splitAppointments(rows, now);
  const watchedAttendance = Form.useWatch("attendance", doneForm) as DoneValues["attendance"] | undefined;
  const anyPresent = Object.values(watchedAttendance ?? {}).includes("present");
  const visible = view === "upcoming" ? upcoming : past;
  const today = upcoming.filter((row) => dayjs(row.date).isSame(now, "day")).length;
  const classNames = [...new Set(advisees.map((student) => student.className))];

  const draft =
    watched?.date && watched?.time && watched?.durationMinutes
      ? { date: watched.date.format("YYYY-MM-DD"), startTime: watched.time.format("HH:mm"), durationMinutes: watched.durationMinutes }
      : null;
  const clash = draft ? upcoming.find((row) => appointmentsOverlap(row, draft)) : undefined;

  const replace = (appointment: Appointment) => setRows((current) => current.map((row) => (row.id === appointment.id ? appointment : row)));

  const create = (values: CreateValues) =>
    startSaving(async () => {
      const result = await createAppointment({
        studentIds: values.studentIds,
        topic: values.topic,
        date: values.date.format("YYYY-MM-DD"),
        startTime: values.time.format("HH:mm"),
        durationMinutes: values.durationMinutes,
        mode: values.mode,
        location: values.location,
      }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa đặt được lịch, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        const { startTime, ...fieldErrors } = result.fieldErrors ?? {};
        createForm.setFields(toFormFields(startTime ? { ...fieldErrors, time: startTime } : fieldErrors));
        messageApi.error(result.message);
        return;
      }
      const appointment = result.data;
      setRows((current) => [...current, appointment]);
      setIsCreateOpen(false);
      setView("upcoming");
      messageApi.success(`Đã hẹn ${appointment.students.length} sinh viên lúc ${appointment.startTime} ${dayText(appointment.date).toLowerCase()}, sinh viên nhận lời mời trên cổng`);
    });

  const complete = (values: DoneValues) => {
    if (!completing) return;
    startSaving(async () => {
      const result = await recordAppointment({ id: completing.id, attendance: values.attendance ?? {}, note: values.note ?? null, followUp: values.followUp ?? null }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        doneForm.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      replace(result.data.appointment);
      setNotes((current) => [...result.data.notes, ...current]);
      setCompleting(null);
      messageApi.success(result.data.appointment.status === "done" ? "Đã ghi nhận buổi gặp vào hồ sơ cố vấn của sinh viên có mặt" : "Đã ghi nhận sinh viên vắng");
    });
  };

  const openRecord = (appointment: Appointment) => {
    setCompleting(appointment);
    doneForm.setFieldsValue({ attendance: Object.fromEntries(appointment.students.map((student) => [student.id, "present"])) });
  };

  const openMove = (appointment: Appointment) => {
    setMoving(appointment);
    moveForm.setFieldsValue({ date: dayjs(appointment.date), time: dayjs(`${appointment.date}T${appointment.startTime}`), durationMinutes: appointment.durationMinutes, location: appointment.location });
  };

  const move = (values: MoveValues) => {
    if (!moving) return;
    startSaving(async () => {
      const result = await moveAppointment({
        id: moving.id,
        date: values.date.format("YYYY-MM-DD"),
        startTime: values.time.format("HH:mm"),
        durationMinutes: values.durationMinutes,
        location: values.location,
      }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa dời được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        const { startTime, ...fieldErrors } = result.fieldErrors ?? {};
        moveForm.setFields(toFormFields(startTime ? { ...fieldErrors, time: startTime } : fieldErrors));
        messageApi.error(result.message);
        return;
      }
      replace(result.data);
      setMoving(null);
      messageApi.success("Đã dời buổi hẹn, sinh viên nhận thông báo giờ mới");
    });
  };

  const cancel = (appointment: Appointment) =>
    modal.confirm({
      title: "Hủy lịch hẹn này?",
      content: `Sinh viên nhận thông báo hủy buổi hẹn ${dayText(appointment.date).toLowerCase()} lúc ${appointment.startTime} trên cổng sinh viên.`,
      okText: "Hủy lịch hẹn",
      okButtonProps: { danger: true },
      cancelText: "Giữ lịch",
      mask: { closable: false },
      onOk: async () => {
        const result = await cancelAppointment(appointment.id).catch(() => null);
        if (!result) {
          messageApi.error("Chưa hủy được, kiểm tra kết nối rồi thử lại.");
          return;
        }
        if (!result.ok) {
          messageApi.error(result.message);
          return;
        }
        replace(result.data);
        messageApi.success("Đã hủy lịch hẹn");
      },
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      {contextHolder}
      {modalContextHolder}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "upcoming", label: today > 0 ? `Sắp tới (${upcoming.length}, ${today} hôm nay)` : `Sắp tới (${upcoming.length})` },
              { value: "past", label: `Đã qua (${past.length})` },
            ]}
          />
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setIsCreateOpen(true)} className="ml-auto">
            Đặt lịch hẹn
          </Button>
        </div>

        {visible.length === 0 ? (
          <SectionCard flush>
            <EmptyState
              illustration="calendar"
              title={view === "upcoming" ? "Không có lịch hẹn sắp tới" : "Chưa có buổi hẹn nào đã qua"}
              description={view === "upcoming" ? "Đặt lịch gặp sinh viên bị cảnh báo hoặc cần tư vấn kế hoạch học tập." : undefined}
            />
          </SectionCard>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((appointment) => {
              const isToday = dayjs(appointment.date).isSame(now, "day");
              return (
                <li key={appointment.id}>
                  <Card size="small" classNames={{ body: "flex flex-col gap-3" }}>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="flex shrink-0 flex-col whitespace-nowrap sm:w-44">
                        <span className={`font-medium ${isToday && appointment.status === "scheduled" ? "text-primary" : ""}`}>{dayText(appointment.date)}</span>
                        <span className="text-sm text-muted tabular-nums">
                          {appointment.startTime} - {startOf(appointment).add(appointment.durationMinutes, "minute").format("HH:mm")}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-pretty">{appointment.topic}</span>
                          {appointment.status !== "scheduled" && <StatusTag status={APPOINTMENT_STATUS[appointment.status]} />}
                        </span>
                        <span className="text-sm text-muted">
                          {APPOINTMENT_MODE_LABEL[appointment.mode]} · {appointment.location}
                        </span>
                        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                          {appointment.students.map((student) => (
                            <span key={student.id}>
                              <Link href={`/lecturer/advising/students/${student.code}`}>{student.fullName}</Link>
                              {student.attendance && <span className={`text-xs ${student.attendance === "absent" ? "text-amber-700" : "text-muted"}`}> ({student.attendance === "present" ? "có mặt" : "vắng"})</span>}
                            </span>
                          ))}
                        </span>
                        {appointment.note && <p className="mt-1 text-sm text-pretty text-muted">“{appointment.note}”</p>}
                      </div>
                    </div>
                    {appointment.status === "scheduled" && (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-border-strong pt-3">
                        <Button size="small" danger onClick={() => cancel(appointment)}>
                          Hủy hẹn
                        </Button>
                        {appointmentStart(appointment).isAfter(now) ? (
                          <Button size="small" onClick={() => openMove(appointment)}>
                            Dời lịch
                          </Button>
                        ) : (
                          <Button size="small" type="primary" onClick={() => openRecord(appointment)}>
                            Ghi nhận buổi gặp
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Notes size={18} aria-hidden className="text-muted" />
            Ghi chú buổi gặp
          </span>
        }
      >
        {notes.length === 0 ? (
          <p className="text-sm text-muted">Ghi chú tạo ra khi bạn ghi nhận đã gặp sinh viên.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-strong">
            {notes.slice(0, 8).map((note) => {
              const student = advisees.find((entry) => entry.id === note.studentId);
              return (
                <li key={note.id} className="flex flex-col gap-1 py-3">
                  <span className="flex items-baseline justify-between gap-2">
                    {student ? (
                      <Link href={`/lecturer/advising/students/${student.code}`} className="truncate font-medium">
                        {student.fullName}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">Sinh viên không còn trong danh sách cố vấn</span>
                    )}
                    <span className="shrink-0 text-xs text-muted tabular-nums">{formatDate(note.at)}</span>
                  </span>
                  <span className="text-xs text-muted">{note.topic}</span>
                  <p className="text-sm text-pretty">{note.content}</p>
                  {note.followUp && <p className="text-xs text-amber-700">Việc tiếp theo: {note.followUp}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <Drawer
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        size={520}
        destroyOnHidden
        mask={{ closable: false }}
        title="Đặt lịch hẹn"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsCreateOpen(false)} disabled={isSaving}>
              Hủy
            </Button>
            <Button type="primary" onClick={() => createForm.submit()} loading={isSaving}>
              Gửi lời mời
            </Button>
          </div>
        }
      >
        <Form form={createForm} layout="vertical" onFinish={create}>
          <Form.Item
            name="studentIds"
            label="Sinh viên"
            rules={[{ required: true, message: "Chọn ít nhất một sinh viên" }]}
            extra={
              <span className="flex flex-wrap gap-x-3">
                Chọn nhanh cả lớp:
                {classNames.map((className) => (
                  <Button
                    key={className}
                    type="link"
                    size="small"
                    className="h-auto p-0"
                    onClick={() => createForm.setFieldValue("studentIds", advisees.filter((student) => student.className === className).map((student) => student.id))}
                  >
                    {className}
                  </Button>
                ))}
              </span>
            }
          >
            <Select
              mode="multiple"
              showSearch={{ optionFilterProp: "label" }}
              maxTagCount="responsive"
              options={advisees.map((student) => ({ value: student.id, label: `${student.fullName} (${student.code})` }))}
            />
          </Form.Item>
          <Form.Item name="topic" label="Nội dung" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
            <AutoComplete options={APPOINTMENT_TOPICS.map((value) => ({ value }))} filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())} />
          </Form.Item>
          <div className="grid gap-x-3 sm:grid-cols-3">
            <Form.Item name="date" label="Ngày" rules={[{ required: true, message: "Chọn ngày" }]}>
              <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" disabledDate={(value) => value.isBefore(dayjs().startOf("day"))} className="w-full" />
            </Form.Item>
            <Form.Item name="time" label="Giờ bắt đầu" rules={[{ required: true, message: "Chọn giờ" }]}>
              <TimePicker format="HH:mm" minuteStep={15} placeholder="Chọn giờ" className="w-full" />
            </Form.Item>
            <Form.Item name="durationMinutes" label="Thời lượng">
              <Select options={APPOINTMENT_DURATIONS.map((value) => ({ value, label: `${value} phút` }))} />
            </Form.Item>
          </div>
          <Form.Item name="mode" label="Hình thức">
            <Radio.Group
              optionType="button"
              options={(Object.keys(APPOINTMENT_MODE_LABEL) as AppointmentMode[]).map((value) => ({ value, label: APPOINTMENT_MODE_LABEL[value] }))}
              onChange={(event) => createForm.setFieldValue("location", DEFAULT_LOCATION[event.target.value as AppointmentMode])}
            />
          </Form.Item>
          <Form.Item name="location" label="Địa điểm hoặc đường dẫn" rules={[{ required: true, whitespace: true, message: "Chưa nhập địa điểm" }]}>
            <Input />
          </Form.Item>
          {clash && (
            <Alert
              type="warning"
              showIcon
              title="Trùng một lịch hẹn khác"
              description={`${clash.topic}, ${clash.startTime} cùng ngày. Vẫn đặt được nhưng nên chọn giờ khác.`}
            />
          )}
        </Form>
      </Drawer>

      <Modal
        open={moving !== null}
        title="Dời buổi hẹn"
        okText="Dời lịch"
        cancelText="Hủy"
        onOk={() => moveForm.submit()}
        confirmLoading={isSaving}
        onCancel={() => setMoving(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {moving && (
          <Form form={moveForm} layout="vertical" onFinish={move}>
            <p className="mb-4 text-sm text-muted">
              {moving.topic} · {moving.students.map((student) => student.fullName).join(", ")}. Sinh viên nhận thông báo giờ mới.
            </p>
            <div className="grid gap-x-3 sm:grid-cols-3">
              <Form.Item name="date" label="Ngày" rules={[{ required: true, message: "Chọn ngày" }]}>
                <DatePicker format="DD/MM/YYYY" disabledDate={(value) => value.isBefore(dayjs().startOf("day"))} className="w-full" />
              </Form.Item>
              <Form.Item name="time" label="Giờ bắt đầu" rules={[{ required: true, message: "Chọn giờ" }]}>
                <TimePicker format="HH:mm" minuteStep={15} className="w-full" />
              </Form.Item>
              <Form.Item name="durationMinutes" label="Thời lượng">
                <Select options={APPOINTMENT_DURATIONS.map((value) => ({ value, label: `${value} phút` }))} />
              </Form.Item>
            </div>
            <Form.Item name="location" label="Địa điểm hoặc đường dẫn" rules={[{ required: true, whitespace: true, message: "Chưa nhập địa điểm" }]}>
              <Input />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        open={completing !== null}
        title="Ghi nhận buổi gặp"
        okText="Lưu ghi chú"
        cancelText="Hủy"
        onOk={() => doneForm.submit()}
        confirmLoading={isSaving}
        onCancel={() => setCompleting(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {completing && (
          <Form form={doneForm} layout="vertical" onFinish={complete}>
            <p className="mb-4 text-sm text-muted">
              {completing.topic} · {completing.students.map((student) => student.fullName).join(", ")} · {formatDateTime(startOf(completing).toISOString())}
            </p>
            <div className="mb-4 flex flex-col gap-2">
              <span className="text-sm font-medium">Có mặt hay vắng</span>
              {completing.students.map((student) => (
                <div key={student.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{student.fullName}</span>
                  <Form.Item name={["attendance", student.id]} className="mb-0">
                    <Radio.Group
                      optionType="button"
                      size="small"
                      aria-label={`Có mặt hay vắng: ${student.fullName}`}
                      options={[
                        { value: "present", label: "Có mặt" },
                        { value: "absent", label: "Vắng" },
                      ]}
                    />
                  </Form.Item>
                </div>
              ))}
            </div>
            <Form.Item
              name="note"
              label="Nội dung trao đổi"
              extra="Ghi vào hồ sơ cố vấn của sinh viên có mặt"
              rules={[{ required: anyPresent, whitespace: true, message: "Ghi lại nội dung chính đã trao đổi" }]}
            >
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount />
            </Form.Item>
            <Form.Item name="followUp" label="Việc cần theo dõi">
              <Input />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
