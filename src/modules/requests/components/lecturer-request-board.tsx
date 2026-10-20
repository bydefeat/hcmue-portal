"use client";

import { useState } from "react";
import { Button, message, Tabs } from "antd";
import { Plus } from "defeat-icons-react";
import type { RequestStatus, RequestView } from "@/modules/requests/requests.type";
import { RequestInbox } from "@/modules/requests/components/request-inbox";
import { NewLecturerRequestDrawer, type BusySlot, type RequestClassOption } from "@/modules/requests/components/new-lecturer-request-drawer";
import { TABS_MORE } from "@/shared/constants/antd.constant";

type LecturerRequestBoardProps = {
  assigned: RequestView[];
  own: RequestView[];
  classes: RequestClassOption[];
  busySlots: BusySlot[];
  rooms: string[];
  requester: { id: string; name: string; code: string; unit: string };
  initialTab?: "assigned" | "own";
  initialStatus?: RequestStatus;
  initialOpenId?: string;
};

export function LecturerRequestBoard({ assigned, own, classes, busySlots, rooms, requester, initialTab, initialStatus, initialOpenId }: LecturerRequestBoardProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [ownRows, setOwnRows] = useState(own);
  const opensOwn = initialOpenId !== undefined && own.some((request) => request.id === initialOpenId);
  const [tab, setTab] = useState(initialTab ?? (opensOwn ? "own" : assigned.some((request) => request.can.decide) || initialOpenId ? "assigned" : "own"));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <Tabs
        more={TABS_MORE}
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
              <RequestInbox requests={assigned} mode="process" processAs="lecturer" initialStatus={initialStatus} initialOpenId={opensOwn ? undefined : initialOpenId} />
            ),
          },
          {
            key: "own",
            label: `Đơn của tôi (${ownRows.length})`,
            children: (
              <RequestInbox
                key={ownRows.length}
                requests={ownRows}
                mode="own"
                showRequester={false}
                initialOpenId={opensOwn ? initialOpenId : undefined}
                onCreated={(request) => setOwnRows((current) => [request, ...current.filter((row) => row.id !== request.id)])}
              />
            ),
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
          setOwnRows((current) => [request, ...current]);
          setIsDrawerOpen(false);
          setTab("own");
          messageApi.success(`Đã gửi đơn ${request.code}, đang chờ ${request.steps[0].label.toLowerCase()}`);
        }}
      />
    </div>
  );
}
