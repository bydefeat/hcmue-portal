import type { NextConfig } from "next";

// Đề thi: 2 tệp, mỗi tệp tối đa 20 MB (minh chứng đơn từ tối đa 25 MB một lần gửi), cộng phần đầu multipart. Action tự kiểm lại
// từng giới hạn. Proxy (src/proxy.ts) đệm thân request của các trang cổng, quá giới hạn của nó thì thân bị cắt im lặng nên phải nâng cùng mức.
const UPLOAD_BODY_LIMIT = "41mb";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
    serverActions: { bodySizeLimit: UPLOAD_BODY_LIMIT },
    proxyClientMaxBodySize: UPLOAD_BODY_LIMIT,
  },
  // Cổng chứa dữ liệu cá nhân và thao tác quản trị: không cho trang khác nhúng (chống clickjacking), không đoán kiểu tệp.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // pdfkit nạp dữ liệu font chuẩn bằng require theo đường dẫn của chính gói: để Node require nguyên gói, không đóng gói lại.
  serverExternalPackages: ["pdfkit"],
  // Font của tệp PDF đọc bằng fs lúc chạy, khai báo để bản triển khai (output file tracing) mang theo.
  outputFileTracingIncludes: { "/*": ["./src/shared/assets/fonts/*"] },
  modularizeImports: {
    antd: { transform: "antd/es/{{ kebabCase member }}" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
