import type { AuditChange } from "@/modules/audit/audit.type";

export function AuditChanges({ changes }: { changes: AuditChange[] }) {
  if (changes.length === 0) return <p className="text-xs text-muted">Thao tác không thay đổi giá trị trường nào.</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {changes.map((change) => (
        <li key={change.field} className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-muted">{change.field}:</span>
          <span className="text-rose-700 line-through">{change.before}</span>
          <span aria-hidden className="text-muted">→</span>
          <span className="sr-only">đổi thành</span>
          <span className="font-medium text-green-700">{change.after}</span>
        </li>
      ))}
    </ul>
  );
}
