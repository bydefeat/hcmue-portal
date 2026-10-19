"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Drawer, Form, Input, InputNumber, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { EQUIPMENT_OPTIONS, ROOM_STATUS, ROOM_TYPE_LABEL, ROOM_TYPE_OPTIONS } from "../facilities.constant";
import type { Campus, Room, RoomStatus, RoomType } from "../facilities.type";
import { RoomWeekGrid, type RoomBooking } from "./room-week-grid";

const WEEK_SLOTS = 6 * 12;

type RoomFormValues = Pick<Room, "capacity" | "examCapacity" | "equipment" | "status" | "note" | "type">;

type RoomTableProps = {
  rooms: Room[];
  campuses: Campus[];
  bookings: Record<string, RoomBooking[]>;
  termName: string;
};

function usedSlots(bookings: RoomBooking[]) {
  return bookings.reduce((sum, booking) => sum + booking.endPeriod - booking.startPeriod + 1, 0);
}

export function RoomTable({ rooms, campuses, bookings, termName }: RoomTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(rooms);
  const [query, setQuery] = useState("");
  const [campusId, setCampusId] = useState<string>();
  const [type, setType] = useState<RoomType>();
  const [status, setStatus] = useState<RoomStatus>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [form] = Form.useForm<RoomFormValues>();
  const opened = rows.find((room) => room.id === openId) ?? null;

  useEffect(() => {
    if (opened) form.setFieldsValue(opened);
  }, [opened, form]);

  const campusName = (id: string) => campuses.find((campus) => campus.id === id)?.name ?? id;
  const filtered = rows.filter(
    (room) =>
      (!query.trim() || room.code.toLowerCase().includes(query.trim().toLowerCase())) &&
      (!campusId || room.campusId === campusId) &&
      (!type || room.type === type) &&
      (!status || room.status === status),
  );

  const save = (values: RoomFormValues) => {
    if (!opened) return;
    const booked = bookings[opened.code] ?? [];
    setRows((current) => current.map((room) => (room.id === opened.id ? { ...room, ...values } : room)));
    if (values.status === "maintenance" && booked.length > 0) {
      messageApi.warning(`Đã chuyển ${opened.code} sang bảo trì. Phòng đang có ${booked.length} buổi học mỗi tuần, cần đổi phòng cho các lớp này.`);
    } else {
      messageApi.success(`Đã lưu thông tin phòng ${opened.code}`);
    }
    setOpenId(null);
  };

  const columns: TableColumnsType<Room> = [
    {
      title: "Phòng",
      dataIndex: "code",
      width: 140,
      render: (code: string, room) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <Button type="link" size="small" onClick={() => setOpenId(room.id)} className="h-auto p-0 font-medium">
            {code}
          </Button>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted tabular-nums md:hidden">
            {ROOM_TYPE_LABEL[room.type]} · {room.capacity} chỗ
            {room.status !== "active" && <StatusTag status={ROOM_STATUS[room.status]} />}
          </span>
        </span>
      ),
    },
    {
      title: "Vị trí",
      key: "place",
      width: 200,
      responsive: ["md"],
      render: (_, room) => (
        <span className="flex flex-col">
          {campusName(room.campusId)}
          <span className="text-xs text-muted">
            {room.building}, tầng {room.floor}
          </span>
        </span>
      ),
    },
    { title: "Loại", dataIndex: "type", width: 120, responsive: ["lg"], render: (value: RoomType) => ROOM_TYPE_LABEL[value] },
    {
      title: <span className="whitespace-nowrap">Sức chứa</span>,
      key: "capacity",
      width: 110,
      responsive: ["md"],
      align: "right",
      sorter: (a, b) => a.capacity - b.capacity,
      render: (_, room) => (
        <span className="flex flex-col tabular-nums">
          {room.capacity}
          <span className="text-xs text-muted">thi {room.examCapacity}</span>
        </span>
      ),
    },
    {
      title: `Sử dụng ${termName}`,
      key: "usage",
      width: 180,
      responsive: ["md"],
      render: (_, room) => {
        const used = usedSlots(bookings[room.code] ?? []);
        return (
          <span className="flex items-center gap-2">
            <MeterBar value={used} max={WEEK_SLOTS} label={`Tỉ lệ sử dụng phòng ${room.code}`} />
            <span className="shrink-0 text-xs text-muted tabular-nums">{used} tiết/tuần</span>
          </span>
        );
      },
    },
    { title: "Thiết bị", dataIndex: "equipment", width: 200, responsive: ["xl"], render: (equipment: string[]) => <span className="text-xs text-pretty text-muted">{equipment.join(", ")}</span> },
    {
      title: "Tình trạng",
      key: "status",
      width: 160,
      responsive: ["md"],
      render: (_, room) =>
        room.status === "active" ? (
          <span className="text-muted">Bình thường</span>
        ) : (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status={ROOM_STATUS[room.status]} />
            {room.note && <span className="text-xs text-pretty text-muted">{room.note}</span>}
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Mã phòng" aria-label="Tìm phòng" className="col-span-2 w-full sm:w-48" />
        <Select allowClear value={campusId} onChange={setCampusId} placeholder="Mọi cơ sở" aria-label="Cơ sở" options={campuses.map((campus) => ({ value: campus.id, label: campus.name }))} className="col-span-2 w-full sm:w-56" />
        <Select allowClear value={type} onChange={setType} placeholder="Mọi loại phòng" aria-label="Loại phòng" options={ROOM_TYPE_OPTIONS} className="min-w-0 sm:w-44" />
        <Select allowClear value={status} onChange={setStatus} placeholder="Mọi tình trạng" aria-label="Tình trạng" options={Object.entries(ROOM_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} className="min-w-0 sm:w-44" />
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: "max-content" }}
        pagination={false}
        locale={{ emptyText: <EmptyState illustration="search" title="Không có phòng khớp bộ lọc" /> }}
      />
      <Drawer
        open={opened !== null}
        onClose={() => setOpenId(null)}
        size={640}
        mask={{ closable: false }}
        destroyOnHidden
        title={opened ? `Phòng ${opened.code}` : ""}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpenId(null)}>Hủy</Button>
            <Button type="primary" onClick={() => form.submit()}>
              Lưu thay đổi
            </Button>
          </div>
        }
      >
        {opened && (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">Lịch sử dụng {termName}</h3>
              {(bookings[opened.code] ?? []).length === 0 ? (
                <p className="text-sm text-muted">Phòng chưa được xếp lớp nào trong học kỳ này.</p>
              ) : (
                <RoomWeekGrid bookings={bookings[opened.code] ?? []} />
              )}
            </section>
            <Form form={form} layout="vertical" onFinish={save}>
              <div className="grid gap-x-3 sm:grid-cols-3">
                <Form.Item name="type" label="Loại phòng">
                  <Select options={ROOM_TYPE_OPTIONS} />
                </Form.Item>
                <Form.Item name="capacity" label="Chỗ ngồi học" rules={[{ required: true, message: "Chưa nhập" }]}>
                  <InputNumber min={1} max={300} className="w-full" />
                </Form.Item>
                <Form.Item
                  name="examCapacity"
                  label="Chỗ ngồi thi"
                  dependencies={["capacity"]}
                  rules={[
                    { required: true, message: "Chưa nhập" },
                    ({ getFieldValue }) => ({
                      validator: (_, value: number) =>
                        value <= getFieldValue("capacity") ? Promise.resolve() : Promise.reject(new Error("Không vượt quá chỗ ngồi học")),
                    }),
                  ]}
                >
                  <InputNumber min={1} max={300} className="w-full" />
                </Form.Item>
              </div>
              <Form.Item name="equipment" label="Thiết bị">
                <Checkbox.Group options={EQUIPMENT_OPTIONS} className="grid grid-cols-2 gap-2" />
              </Form.Item>
              <Form.Item name="status" label="Tình trạng">
                <Select options={Object.entries(ROOM_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} />
              </Form.Item>
              <Form.Item name="note" label="Ghi chú">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={200} showCount />
              </Form.Item>
            </Form>
          </div>
        )}
      </Drawer>
    </div>
  );
}
