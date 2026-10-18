"use client";

import { useId, useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { extractStyle, StyleProvider } from "@ant-design/cssinjs";
import CacheEntity from "@ant-design/cssinjs/es/Cache";

export function AntdRegistry({ children }: { children: React.ReactNode }) {
  const instanceId = useId();
  const [cache] = useState(() => new CacheEntity(instanceId));

  useServerInsertedHTML(() => {
    const styleText = extractStyle(cache, { plain: true, once: true });
    if (!styleText) return null;
    return <style id="antd-cssinjs" data-rc-order="prepend" data-rc-priority="-1000" dangerouslySetInnerHTML={{ __html: styleText }} />;
  });

  return (
    <StyleProvider cache={cache} layer>
      {children}
    </StyleProvider>
  );
}
