"use client";

import { useState } from "react";
import { Modal, Radio } from "antd";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { meetingText, overlaps } from "../course-registration.constant";
import type { ClassMeeting, ClassSectionView } from "../course-registration.type";

type LabGroupPickerProps = {
  section: ClassSectionView | null;
  busyMeetings: { code: string; meeting: ClassMeeting }[];
  initialGroupId?: string;
  onCancel: () => void;
  onConfirm: (section: ClassSectionView, groupId: string) => void;
};

export function LabGroupPicker({ section, busyMeetings, initialGroupId, onCancel, onConfirm }: LabGroupPickerProps) {
  if (!section) return null;
  return <PickerBody section={section} busyMeetings={busyMeetings} initialGroupId={initialGroupId} onCancel={onCancel} onConfirm={onConfirm} />;
}

function PickerBody({ section, busyMeetings, initialGroupId, onCancel, onConfirm }: LabGroupPickerProps & { section: ClassSectionView }) {
  const options = section.labGroups.map((group) => {
    const clash = busyMeetings.find((busy) => overlaps(busy.meeting, group.meeting));
    const isFull = group.enrolled >= group.capacity;
    return { group, clash, isFull, disabled: isFull || Boolean(clash) };
  });
  const firstOpen = options.find((option) => !option.disabled)?.group.id;
  const [groupId, setGroupId] = useState<string | undefined>(initialGroupId ?? firstOpen);

  return (
    <Modal
      open
      title={`Chọn nhóm thực hành, ${section.code}`}
      okText="Chọn nhóm này"
      cancelText="Hủy"
      okButtonProps={{ disabled: !groupId }}
      onCancel={onCancel}
      onOk={() => groupId && onConfirm(section, groupId)}
      mask={{ closable: false }}
    >
      <p className="mb-3 text-sm text-pretty text-muted">
        Lý thuyết: {section.meetings.map(meetingText).join("; ")}. Mỗi sinh viên học đúng một nhóm thực hành.
      </p>
      <Radio.Group value={groupId} onChange={(event) => setGroupId(event.target.value)} className="flex w-full flex-col gap-2">
        {options.map(({ group, clash, isFull, disabled }) => (
          <div
            key={group.id}
            role="presentation"
            onClick={() => !disabled && setGroupId(group.id)}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border-strong p-3 transition-colors ${
              disabled ? "cursor-not-allowed opacity-60" : "hover:bg-surface-hover"
            }`}
          >
            <Radio value={group.id} disabled={disabled} className="mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-mono text-xs">{group.code}</span>
              <span className="text-sm">{meetingText(group.meeting)}</span>
              <span className="flex items-center gap-2">
                <MeterBar value={group.enrolled} max={group.capacity} tone={isFull ? "warning" : "primary"} label={`Sĩ số ${group.code}`} />
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {group.enrolled}/{group.capacity}
                </span>
              </span>
              {isFull && <span className="text-xs text-amber-700">Nhóm đã đủ chỗ</span>}
              {clash && <span className="text-xs text-rose-700">Trùng lịch với {clash.code}</span>}
            </span>
          </div>
        ))}
      </Radio.Group>
    </Modal>
  );
}
