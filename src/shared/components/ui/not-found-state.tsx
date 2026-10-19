import { Button, Card, Result } from "antd";
import { FileSearch } from "defeat-icons-react";

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
      <Result
        icon={<FileSearch size={56} aria-hidden className="mx-auto text-zinc-500" />}
        title={<h1 className="text-xl font-semibold">{title}</h1>}
        subTitle={description}
        extra={
          <Button type="primary" href={homeHref}>
            {homeLabel}
          </Button>
        }
      />
    </Card>
  );
}
