"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { Button } from "antd";
import { Menu, Xmark } from "defeat-icons-react";
import { Logo } from "@/shared/components/ui/logo";
import { isActiveItem, type NavItem } from "@/shared/constants/navigation.constant";

export type MobileNavigationSection = {
  title?: string;
  items: NavItem[];
};

type MobileNavigationProps = {
  dockItems: NavItem[];
  sections: MobileNavigationSection[];
  homeHref: string;
  hideFrom: "md" | "lg";
  action?: { label: string; href: string };
};

const HIDE_CLASS = { md: "md:hidden", lg: "lg:hidden" } as const;
const MENU_KEY = "menu";
const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;
const HIDE_TRANSITION = { duration: 0.28, ease: [0.16, 1, 0.3, 1] } as const;

function isTextField(element: Element | null) {
  return (
    element instanceof HTMLElement &&
    (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable)
  );
}

function classes(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export function MobileNavigation({ dockItems, sections, homeHref, hideFrom, action }: MobileNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrollHidden, setIsScrollHidden] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [previousPathname, setPreviousPathname] = useState(pathname);
  const lastScrollY = useRef(0);

  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setIsOpen(false);
    setIsScrollHidden(false);
  }

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const isAtBottom = window.innerHeight + currentY >= document.documentElement.scrollHeight - 80;
      if (currentY <= 10 || isAtBottom) setIsScrollHidden(false);
      else if (currentY > lastScrollY.current + 12 && currentY > 60) setIsScrollHidden(true);
      else if (currentY < lastScrollY.current - 8) setIsScrollHidden(false);
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleFocusIn = (event: FocusEvent) => {
      clearTimeout(timer);
      if (isTextField(event.target as Element | null)) setIsTyping(true);
    };
    const handleFocusOut = () => {
      timer = setTimeout(() => {
        if (!isTextField(document.activeElement)) setIsTyping(false);
      }, 60);
    };
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const activeDockHref = dockItems.find((item) => isActiveItem(pathname, item))?.href;
  const isInSections = sections.some((section) => section.items.some((item) => isActiveItem(pathname, item)));
  const activeKey = isOpen ? MENU_KEY : (activeDockHref ?? (isInSections ? MENU_KEY : null));
  const isDockHidden = (isScrollHidden || isTyping) && !isOpen;

  return (
    <>
      <motion.nav
        aria-label="Điều hướng nhanh"
        initial={false}
        animate={isDockHidden ? { y: 120, opacity: 0 } : { y: 0, opacity: 1 }}
        transition={HIDE_TRANSITION}
        style={{ pointerEvents: isDockHidden ? "none" : "auto" }}
        className={classes(
          "fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[420px] touch-manipulation select-none",
          HIDE_CLASS[hideFrom],
        )}
      >
        <LayoutGroup id="mobile-dock">
          <div className="flex h-[54px] items-center justify-around rounded-[22px] border border-border-strong bg-surface/90 p-1.5 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            {dockItems.map((item) => (
              <DockLink key={item.href} item={item} isActive={activeKey === item.href} />
            ))}
            <DockButton isActive={activeKey === MENU_KEY} isOpen={isOpen} onPress={() => setIsOpen(true)} />
          </div>
        </LayoutGroup>
      </motion.nav>

      <div
        aria-hidden
        onClick={close}
        className={classes(
          "fixed inset-0 z-50 bg-black/60 transition-opacity duration-300",
          HIDE_CLASS[hideFrom],
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Điều hướng"
        inert={!isOpen}
        className={classes(
          "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-sm transform-gpu flex-col bg-surface transition-[translate,box-shadow] duration-300",
          HIDE_CLASS[hideFrom],
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-strong p-5">
          <Logo href={homeHref} />
          <button
            type="button"
            onClick={close}
            aria-label="Đóng thanh điều hướng"
            className="shrink-0 cursor-pointer p-1.5 text-muted transition-colors hover:text-foreground"
          >
            <Xmark size={20} aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 select-none">
          {sections.map((section, index) => (
            <div key={section.title ?? index} className="space-y-1">
              {section.title && (
                <div className="px-2 pb-1 text-[10px] font-extrabold tracking-widest text-muted uppercase">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = isActiveItem(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    aria-current={isActive ? "page" : undefined}
                    className={classes(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-bold tracking-wider uppercase transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-item-hover",
                    )}
                  >
                    {Icon && <Icon size={16} aria-hidden className="shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          {action && (
            <Button type="primary" block onClick={() => router.push(action.href)}>
              {action.label}
            </Button>
          )}
        </div>
      </aside>
    </>
  );
}

const DOCK_ITEM_CLASS =
  "group relative isolate flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl transition-transform duration-200 active:scale-95";

function DockIcon({ icon: Icon, isActive }: { icon: NonNullable<NavItem["icon"]>; isActive: boolean }) {
  return (
    <>
      <span className="relative flex h-[34px] w-[53px] items-center justify-center">
        <span className="inline-flex transition-transform duration-200 group-hover:scale-110">
          <Icon size={22} aria-hidden />
        </span>
      </span>
      {isActive && (
        <motion.span
          layoutId="mobile-dock-dot"
          aria-hidden
          transition={SPRING}
          className="absolute -bottom-0.5 size-1 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]"
        />
      )}
    </>
  );
}

function DockLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={isActive ? "page" : undefined}
      className={classes(DOCK_ITEM_CLASS, isActive ? "text-primary" : "text-foreground opacity-55")}
    >
      {item.icon && <DockIcon icon={item.icon} isActive={isActive} />}
    </Link>
  );
}

function DockButton({ isActive, isOpen, onPress }: { isActive: boolean; isOpen: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label="Mở thanh điều hướng"
      aria-controls="mobile-sidebar"
      aria-expanded={isOpen}
      onClick={onPress}
      className={classes(DOCK_ITEM_CLASS, isActive ? "text-primary" : "text-foreground opacity-55")}
    >
      <DockIcon icon={Menu} isActive={isActive} />
    </button>
  );
}
