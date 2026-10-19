import Link from "next/link";
import { Card, Result } from "antd";

type NotFoundStateProps = {
  homeHref?: string;
  homeLabel?: string;
};

export function NotFoundState({ homeHref = "/", homeLabel = "Về trang chủ" }: NotFoundStateProps) {
  return (
    <Card>
      <Result
        status="404"
        title={<h1 className="text-xl font-semibold">Không tìm thấy trang</h1>}
        subTitle="Đường dẫn có thể đã sai, hoặc dữ liệu đã bị xóa hay chuyển sang học kỳ khác. Kiểm tra lại đường dẫn hoặc quay về trang chính để tìm tiếp."
        extra={<Link href={homeHref}>{homeLabel}</Link>}
      />
    </Card>
  );
}
