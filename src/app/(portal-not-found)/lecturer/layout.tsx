// Đường dẫn sai trong cổng nằm ở nhóm route riêng, không có loading.tsx: notFound() chạy trước khi stream nên trả HTTP 404 thật,
// vẫn hiện trong khung cổng vì dùng lại đúng layout và trang 404 của cổng.
export { default } from "@/app/(lecturer)/lecturer/layout";
