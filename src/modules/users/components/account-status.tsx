import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { ACCOUNT_STATUS } from "@/modules/users/users.constant";
import type { AccountState } from "@/modules/users/users.type";

export function AccountStatus({ account }: { account: AccountState }) {
  if (account.status === "active") {
    return (
      <span className="text-xs text-muted" title={account.lastSignInAt ? `Đăng nhập lần cuối ${formatDateTime(account.lastSignInAt)}` : undefined}>
        {ACCOUNT_STATUS.active.label}
      </span>
    );
  }
  return <StatusTag status={ACCOUNT_STATUS[account.status]} />;
}
