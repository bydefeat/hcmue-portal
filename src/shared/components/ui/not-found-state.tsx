import Link from "next/link";
import { Card, Result } from "antd";

type NotFoundStateProps = {
  title?: string;
  description?: string;
  homeHref?: string;
  homeLabel?: string;
};

export function NotFoundState({
  title = "Không tìm thấy trang",
  description = "Đường dẫn đã sai, hoặc dữ liệu đã bị xóa hay chuyển đi.",
  homeHref = "/",
  homeLabel = "Về trang chủ",
}: NotFoundStateProps) {
  return (
    <Card>
      <Result status="404" title={<h1 className="text-xl font-semibold">{title}</h1>} subTitle={description} extra={<Link href={homeHref}>{homeLabel}</Link>} />
    </Card>
  );
}
