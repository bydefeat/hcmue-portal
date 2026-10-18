"use client";

import { useEffect, useState } from "react";
import { Button } from "antd";

const COOLDOWN_SECONDS = 60;

export function ResendCodeButton({ onResend }: { onResend?: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft === 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <Button
      type="link"
      size="small"
      disabled={secondsLeft > 0}
      onClick={() => {
        onResend?.();
        setSecondsLeft(COOLDOWN_SECONDS);
      }}
      className="px-0"
    >
      {secondsLeft > 0 ? <span className="tabular-nums">Gửi lại mã sau {secondsLeft}s</span> : "Gửi lại mã"}
    </Button>
  );
}
