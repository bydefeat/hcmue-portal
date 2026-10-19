import Link from "next/link";
import { MapXmark } from "defeat-icons-react";

export function NotFoundState({ homeHref = "/", homeLabel = "Về trang chủ" }: { homeHref?: string; homeLabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 py-12 text-center sm:px-8">
      <MapXmark size={32} aria-hidden className="text-muted" />
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="max-w-md text-sm text-pretty text-muted">
        Đường dẫn có thể đã sai, hoặc dữ liệu đã bị xóa hay chuyển sang học kỳ khác. Kiểm tra lại đường dẫn hoặc quay về trang chính để tìm tiếp.
      </p>
      <Link href={homeHref} className="mt-2 text-sm">
        {homeLabel}
      </Link>
    </div>
  );
}
