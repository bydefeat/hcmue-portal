"use client";

import { Button } from "antd";
import { Print } from "defeat-icons-react";

export function PrintButton({ label = "In" }: { label?: string }) {
  return (
    <Button icon={<Print size={16} aria-hidden />} onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
