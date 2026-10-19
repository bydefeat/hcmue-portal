"use client";

import { useEffect, useState } from "react";
import { Button, DatePicker, Drawer, Form, Input, message, Segmented, Select } from "antd";
import type { Dayjs } from "dayjs";
import { Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { CALENDAR_EVENT_LABEL, CALENDAR_EVENT_OPTIONS } from "@/modules/settings/settings.constant";
import type { CalendarEvent, CalendarEventKind } from "@/modules/settings/settings.type";
import { SectionCard } from "@/shared/components/ui/section-card";

type TermOption = { id: string; name: string };

type EventValues = { title: string; kind: CalendarEventKind; range: [Dayjs, Dayjs]; audience: string };

const ONGOING: StatusMeta = { label: "Đang diễn ra", tone: "success" };
const UPCOMING: StatusMeta = { label: "Sắp tới", tone: "neutral" };

function stateOf(event: CalendarEvent) {
  const today = dayjs().startOf("day");
  if (dayjs(event.endDate).isBefore(today)) return "past";
  if (dayjs(event.startDate).isAfter(today)) return "upcoming";
  return "ongoing";
}

export function AcademicCalendar({
  events,
  terms,
  defaultTermId,
  header,
}: {
  events: CalendarEvent[];
  terms: TermOption[];
  defaultTermId: string;
  header: { title: string; description?: React.ReactNode };
}) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(events);
  const [termId, setTermId] = useState(defaultTermId);
  const [kind, setKind] = useState<CalendarEventKind>();
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<EventValues>();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) form.setFieldsValue({ title: editing.title, kind: editing.kind, audience: editing.audience, range: [dayjs(editing.startDate), dayjs(editing.endDate)] });
  }, [open, editing, form]);

  const visible = rows
    .filter((event) => event.termId === termId && (!kind || event.kind === kind))
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate));
  const months = [...new Set(visible.map((event) => dayjs(event.startDate).format("YYYY-MM")))];

  const submit = (values: EventValues) => {
    const next: CalendarEvent = {
      id: editing?.id ?? `su-kien-${rows.length + 1}`,
      termId,
      kind: values.kind,
      title: values.title.trim(),
      startDate: values.range[0].format("YYYY-MM-DD"),
      endDate: values.range[1].format("YYYY-MM-DD"),
      audience: values.audience.trim(),
    };
    setRows((current) => (editing ? current.map((event) => (event.id === editing.id ? next : event)) : [...current, next]));
    messageApi.success(editing ? `Đã cập nhật ${next.title}` : `Đã thêm ${next.title} vào lịch năm học`);
    setOpen(false);
  };

  return (
    <>
      {contextHolder}
      <PageHeader
        {...header}
        actions={
          <Button
            type="primary"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Thêm mốc
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={termId}
            onChange={(value) => setTermId(value as string)}
            options={terms.map((term) => ({ value: term.id, label: term.name }))}
            className="w-fit max-w-full"
          />
          <Select allowClear value={kind} onChange={setKind} placeholder="Mọi loại mốc" aria-label="Loại mốc" options={CALENDAR_EVENT_OPTIONS} className="w-full sm:w-48" />
        </div>
        {visible.length === 0 ? (
          <SectionCard flush>
            <EmptyState illustration="calendar" title="Chưa có mốc nào" description="Thêm thời gian học, thi, đăng ký và nghỉ lễ để giảng viên và sinh viên cùng theo dõi." />
          </SectionCard>
        ) : (
          months.map((month) => (
            <SectionCard key={month} flush title={<span className="capitalize">{dayjs(`${month}-01`).format("MMMM YYYY")}</span>}>
              <ul className="flex flex-col divide-y divide-border-strong">
                {visible
                  .filter((event) => dayjs(event.startDate).format("YYYY-MM") === month)
                  .map((event) => {
                    const state = stateOf(event);
                    return (
                      <li key={event.id}>
                        <Button
                          type="text"
                          block
                          onClick={() => {
                            setEditing(event);
                            setOpen(true);
                          }}
                          className={`h-auto flex-col items-stretch gap-1 rounded-none px-4 py-3 text-left whitespace-normal sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${state === "past" ? "text-muted" : ""}`}
                        >
                          <span className="w-44 shrink-0 text-sm tabular-nums">
                            {event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="font-medium text-pretty">{event.title}</span>
                            <span className="text-xs text-muted">
                              {CALENDAR_EVENT_LABEL[event.kind]} · {event.audience}
                            </span>
                          </span>
                          {state !== "past" && <StatusTag status={state === "ongoing" ? ONGOING : UPCOMING} className="w-fit" />}
                        </Button>
                      </li>
                    );
                  })}
              </ul>
            </SectionCard>
          ))
        )}
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          size={480}
          mask={{ closable: false }}
          destroyOnHidden
          title={editing ? "Sửa mốc lịch" : "Thêm mốc lịch"}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Hủy</Button>
              <Button type="primary" onClick={() => form.submit()}>
                {editing ? "Lưu thay đổi" : "Thêm mốc"}
              </Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" onFinish={submit}>
            <Form.Item name="title" label="Tên mốc" rules={[{ required: true, whitespace: true, message: "Chưa nhập tên mốc" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="kind" label="Loại" rules={[{ required: true, message: "Chưa chọn loại" }]}>
              <Select placeholder="Chọn loại mốc" options={CALENDAR_EVENT_OPTIONS} />
            </Form.Item>
            <Form.Item name="range" label="Thời gian" rules={[{ required: true, message: "Chưa chọn thời gian" }]}>
              <DatePicker.RangePicker format="DD/MM/YYYY" placeholder={["Từ ngày", "Đến ngày"]} className="w-full" />
            </Form.Item>
            <Form.Item name="audience" label="Đối tượng" rules={[{ required: true, whitespace: true, message: "Chưa nhập đối tượng" }]}>
              <Input placeholder="Ví dụ: Toàn trường, Khóa 50" />
            </Form.Item>
          </Form>
        </Drawer>
      </div>
    </>
  );
}
