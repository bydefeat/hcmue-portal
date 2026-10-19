import { Button, Card, Result } from "antd";
import { Illustration } from "@/shared/components/ui/illustration";

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
        icon={<Illustration name="not-found" className="mx-auto w-48 sm:w-60" />}
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
