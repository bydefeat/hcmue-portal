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
