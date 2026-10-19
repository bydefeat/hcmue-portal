import { NotFoundState } from "@/shared/components/ui/not-found-state";

export default function NotFound() {
  return (
    <NotFoundState
      title="Không tìm thấy lớp"
      description="Lớp không tồn tại hoặc không do bạn phụ trách trong học kỳ này."
      homeHref="/lecturer/classes"
      homeLabel="Về Lớp học phần"
    />
  );
}
