import type { ReactNode } from "react";

import mark from "@/assets/brand/header-amp.png";

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-3 px-5">
        <img src={mark} alt="" className="h-8 w-auto" />
        <div className="leading-tight">
          <p className="font-display text-base font-semibold tracking-wide">Static Notes Studio</p>
          <p className="text-[11px] text-sidebar-foreground/60">Rise PDF → branded Word notes</p>
        </div>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
