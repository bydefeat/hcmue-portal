import { cloneElement, createElement, isValidElement, type ReactElement } from "react";
import type { PaginationProps, TabsProps } from "antd";
import { Dots } from "defeat-icons-react";

const PAGINATION_LABEL: Partial<Record<string, string>> = {
  prev: "Trang trước",
  next: "Trang sau",
  "jump-prev": "Lùi 5 trang",
  "jump-next": "Tiến 5 trang",
};

export const paginationItemRender: PaginationProps["itemRender"] = (_, type, element) => {
  const label = PAGINATION_LABEL[type];
  return label && isValidElement(element) ? cloneElement(element as ReactElement<{ "aria-label"?: string }>, { "aria-label": label }) : element;
};

export const TABS_MORE: TabsProps["more"] = {
  icon: createElement(Dots, { size: 16, "aria-label": "Xem thêm mục", role: "img", className: "text-zinc-500" }),
};
