"use client";

import { useTransition } from "react";
import { Button, Dropdown, message, Modal } from "antd";
import { ChevronDown } from "defeat-icons-react";
import type { ActionResult } from "@/shared/libs/action.lib";
import { provisionAccounts, resendActivation, setAccountLock } from "@/modules/users/users.action";
import { accountBatchSummary, type AccountBatchAction } from "@/modules/users/users.rule";
import type { AccountBatchResult, AccountKind, AccountState } from "@/modules/users/users.type";

type AccountBulkActionsProps = {
  kind: AccountKind;
  selectedIds: string[];
  onUpdated: (accounts: Record<string, AccountState>) => void;
};

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

export function AccountBulkActions({ kind, selectedIds, onUpdated }: AccountBulkActionsProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [isPending, startTransition] = useTransition();
  const noun = { student: "sinh viên", lecturer: "giảng viên", staff: "cán bộ" }[kind];

  const call = (action: AccountBatchAction) => {
    const input = { kind, ids: selectedIds };
    if (action === "provision") return provisionAccounts(input);
    if (action === "resend") return resendActivation(input);
    return setAccountLock({ ...input, locked: action === "lock" });
  };

  const run = (action: AccountBatchAction) =>
    startTransition(async () => {
      const result: ActionResult<AccountBatchResult> | null = await call(action).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      onUpdated(result.data.accounts);
      const text = accountBatchSummary(action, result.data);
      if (result.data.skipped.length > 0) messageApi.warning(text, 8);
      else messageApi.success(text);
    });

  const confirmLock = () =>
    modal.confirm({
      title: `Khóa tài khoản của ${selectedIds.length} ${noun}?`,
      content: "Người bị khóa bị đăng xuất khỏi mọi thiết bị ngay và không đăng nhập được cho tới khi được mở khóa. Hồ sơ, điểm, đăng ký học phần giữ nguyên.",
      okText: "Khóa tài khoản",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: () => run("lock"),
    });

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <Button size="small" loading={isPending} onClick={() => run("provision")}>
        Cấp tài khoản
      </Button>
      <Dropdown
        trigger={["click"]}
        disabled={isPending}
        menu={{
          items: [
            { key: "resend", label: "Gửi lại thư kích hoạt" },
            { key: "unlock", label: "Mở khóa tài khoản" },
            { type: "divider" },
            { key: "lock", label: "Khóa tài khoản", danger: true },
          ],
          onClick: ({ key }) => (key === "lock" ? confirmLock() : run(key as AccountBatchAction)),
        }}
      >
        <Button size="small" icon={<ChevronDown size={14} aria-hidden className="text-zinc-500" />} iconPlacement="end">
          Tài khoản khác
        </Button>
      </Dropdown>
    </>
  );
}
