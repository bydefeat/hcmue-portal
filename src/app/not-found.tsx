import type { Metadata } from "next";
import { NotFoundState } from "@/shared/components/ui/not-found-state";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <NotFoundState />
      </div>
    </main>
  );
}
