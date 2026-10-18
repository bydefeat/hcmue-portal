"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "defeat-icons-react";
import { isActiveHref, type NavGroup, type NavItem } from "@/shared/constants/navigation.constant";

const ITEM_HEIGHT = 36;
const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

function classes(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

function TreeGuide({ activeIndex, count }: { activeIndex: number; count: number }) {
  const markerY = activeIndex * ITEM_HEIGHT + ITEM_HEIGHT / 2;
  const end = (count - 1) * ITEM_HEIGHT + ITEM_HEIGHT / 2;
  const hasActive = activeIndex >= 0;

  return (
    <svg aria-hidden className="pointer-events-none absolute top-0 left-1 h-full w-5">
      <rect x="9.5" y="0" width="1" height={end} className="fill-border-strong" />
      <circle cx="10" cy={end} r="2" className="fill-border-strong" />
      <rect
        x="9.5"
        y="0"
        width="1"
        rx="0.5"
        className="fill-primary motion-reduce:transition-none"
        style={{ height: hasActive ? markerY : 0, transition: `height 300ms ${EASING}` }}
      />
      <g
        className="motion-reduce:transition-none"
        style={{
          transform: `translateY(${hasActive ? markerY : 0}px)`,
          opacity: hasActive ? 1 : 0,
          transition: `transform 300ms ${EASING}, opacity 200ms`,
        }}
      >
        <rect x="6" y="-3.5" width="7" height="7" rx="1" transform="rotate(45 9.5 0)" className="fill-primary" />
      </g>
    </svg>
  );
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeIndex = items.findIndex((item) => isActiveHref(pathname, item.href));

  return (
    <ul className="relative flex flex-col">
      <TreeGuide activeIndex={activeIndex} count={items.length} />
      {items.map((item, index) => {
        const Icon = item.icon;
        const isActive = index === activeIndex;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={classes(
                "flex h-9 items-center gap-2.5 rounded-lg pr-2.5 pl-8 font-medium transition-colors duration-150",
                isActive ? "font-semibold text-primary" : "text-muted hover:bg-item-hover hover:text-foreground",
              )}
            >
              {Icon && <Icon size={15} aria-hidden className="shrink-0" />}
              <span title={item.label} className="truncate">
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

type NavSectionsProps = {
  groups: NavGroup[];
  idPrefix: string;
  onNavigate?: () => void;
};

function activeGroupLabel(groups: NavGroup[], pathname: string) {
  return groups.find((group) => group.items.some((item) => isActiveHref(pathname, item.href)))?.label;
}

export function NavSections({ groups, idPrefix, onNavigate }: NavSectionsProps) {
  const pathname = usePathname();
  const [closedLabels, setClosedLabels] = useState<string[]>([]);
  const [previousPathname, setPreviousPathname] = useState(pathname);

  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    const activeLabel = activeGroupLabel(groups, pathname);
    if (activeLabel && closedLabels.includes(activeLabel)) {
      setClosedLabels(closedLabels.filter((label) => label !== activeLabel));
    }
  }

  const toggle = (label: string) =>
    setClosedLabels((labels) => (labels.includes(label) ? labels.filter((value) => value !== label) : [...labels, label]));

  return (
    <ul className="flex flex-col gap-1">
      {groups.map((group, index) => {
        const SectionIcon = group.icon;
        const hasActive = group.items.some((item) => isActiveHref(pathname, item.href));
        const isOpen = !closedLabels.includes(group.label);
        const panelId = `${idPrefix}-${index}`;

        return (
          <li key={group.label}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(group.label)}
              className={classes(
                "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left font-medium transition-colors duration-150",
                hasActive ? "bg-primary/10 text-primary" : "text-muted hover:bg-item-hover hover:text-foreground",
              )}
            >
              <SectionIcon size={16} aria-hidden className="shrink-0" />
              <span title={group.label} className="flex-1 truncate">
                {group.label}
              </span>
              <ChevronRight
                size={14}
                aria-hidden
                className={classes(
                  "shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                  isOpen && "rotate-90",
                )}
              />
            </button>

            <div
              id={panelId}
              inert={!isOpen}
              className={classes(
                "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="my-1">
                  <NavList items={group.items} onNavigate={onNavigate} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
