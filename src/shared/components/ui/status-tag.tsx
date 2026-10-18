import { Tag } from "antd";
import { STATUS_TONE_COLOR, type StatusMeta } from "@/shared/constants/status.constant";

export function StatusTag({ status, className }: { status: StatusMeta; className?: string }) {
  return (
    <Tag variant="filled" color={STATUS_TONE_COLOR[status.tone]} className={`me-0 font-medium ${className ?? ""}`}>
      {status.label}
    </Tag>
  );
}
