"use client";

import { useState } from "react";
import { Button, message, Tabs } from "antd";
import { Plus } from "defeat-icons-react";
import { requestView } from "../requests.constant";
import type { RequestStatus, RequestView } from "../requests.type";
import { RequestInbox } from "./request-inbox";
import { NewLecturerRequestDrawer, type BusySlot, type RequestClassOption } from "./new-lecturer-request-drawer";

type LecturerRequestBoardProps = {
  assigned: RequestView[];
  own: RequestView[];
  classes: RequestClassOption[];
  busySlots: BusySlot[];
  rooms: string[];
  requester: { id: string; name: string; code: string; unit: string };
  initialTab?: "assigned" | "own";
  initialStatus?: RequestStatus;
};

export function LecturerRequestBoard({ assigned, own, classes, busySlots, rooms, requester, initialTab, initialStatus }: LecturerRequestBoardProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [ownRows, setOwnRows] = useState(own);
  const [tab, setTab] = useState(initialTab ?? (assigned.some((request) => request.status === "pending" || request.status === "in-review") ? "assigned" : "own"));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as "assigned" | "own")}
        tabBarExtraContent={
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setIsDrawerOpen(true)}>
            Tạo đơn
          </Button>
        }
        items={[
          {
            key: "assigned",
            label: "Đơn được giao",
            children: (
              <RequestInbox
                requests={assigned}
                mode="process"
                actorName={requester.name}
                actorId={requester.id}
                actorRoles={["advisor", "lecturer"]}
                initialStatus={initialStatus}
              />
            ),
          },
          {
            key: "own",
            label: `Đơn của tôi (${ownRows.length})`,
            children: <RequestInbox key={ownRows.length} requests={ownRows} mode="own" actorName={requester.name} showRequester={false} />,
          },
        ]}
      />
      <NewLecturerRequestDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        classes={classes}
        busySlots={busySlots}
        rooms={rooms}
        requester={requester}
        onCreated={(request) => {
          setOwnRows((current) => [requestView(request), ...current]);
          setIsDrawerOpen(false);
          setTab("own");
          messageApi.success(`Đã gửi đơn ${request.code}, đang chờ ${request.steps[0].label.toLowerCase()}`);
        }}
      />
    </div>
  );
}
