"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal, Progress } from "antd";
import { HourglassClock } from "defeat-icons-react";

type RegistrationQueueModalProps = {
  open: boolean;
  onAdmitted: () => void;
  onLeave: () => void;
};

const START_POSITION = 1286;
const TICK_MS = 450;
const THROUGHPUT_PER_MINUTE = 2400;

export function RegistrationQueueModal({ open, onAdmitted, onLeave }: RegistrationQueueModalProps) {
  return open ? <QueueBody onAdmitted={onAdmitted} onLeave={onLeave} /> : null;
}

function QueueBody({ onAdmitted, onLeave }: Omit<RegistrationQueueModalProps, "open">) {
  const [position, setPosition] = useState(START_POSITION);
  const admitted = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setPosition((current) => Math.max(0, current - 90 - Math.round(Math.random() * 90)));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (position > 0 || admitted.current) return;
    admitted.current = true;
    const timer = setTimeout(onAdmitted, 600);
    return () => clearTimeout(timer);
  }, [position, onAdmitted]);

  const seconds = Math.ceil((position / THROUGHPUT_PER_MINUTE) * 60);
  const percent = Math.round(((START_POSITION - position) / START_POSITION) * 100);

  return (
    <Modal
      open
      title="Đang xếp hàng để đăng ký"
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      footer={
        <Button onClick={onLeave} disabled={position === 0}>
          Rời hàng đợi
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <HourglassClock size={28} aria-hidden className="text-muted" />
        {position > 0 ? (
          <>
            <p className="text-base" aria-live="polite">
              Còn <span className="font-semibold tabular-nums">{position.toLocaleString("vi-VN")}</span> sinh viên phía trước
            </p>
            <p className="text-sm text-pretty text-muted tabular-nums">
              Ước tính khoảng {seconds} giây. Giữ nguyên trang này, các lớp bạn đã chọn được giữ nguyên và gửi đi khi đến lượt.
            </p>
          </>
        ) : (
          <p className="text-base" aria-live="polite">
            Đến lượt bạn, đang ghi nhận đăng ký
          </p>
        )}
        <Progress percent={percent} showInfo={false} className="w-full" />
      </div>
    </Modal>
  );
}
