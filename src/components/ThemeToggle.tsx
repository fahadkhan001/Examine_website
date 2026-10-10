"use client";

import { useSyncExternalStore } from "react";
import { cx } from "./ui";

type Theme = "light" | "dark" | "system";

/**
 * Inline script in <head> applies the saved theme before paint (no flash).
 * No saved choice = light (white) mode.
 */
export const themeScript = `try{var t=localStorage.getItem("ew-theme");if(t==="dark"||t==="system")document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const readTheme = (): Theme => {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || t === "system" ? t : "light";
};

function setTheme(t: Theme) {
  if (t === "light") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === "light") localStorage.removeItem("ew-theme");
    else localStorage.setItem("ew-theme", t);
  } catch {}
  listeners.forEach((l) => l());
}

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></svg>,
  },
  {
    value: "dark",
    label: "Dark",
    icon: <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M16 12.5A6.5 6.5 0 017.5 4a6.5 6.5 0 108.5 8.5z" /></svg>,
  },
  {
    value: "system",
    label: "Auto",
    icon: <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2.5" y="3.5" width="15" height="10" rx="1.5" /><path d="M7 17h6M10 13.5V17" /></svg>,
  },
];

/** Light / Dark / Auto segmented control. */
export function ThemeToggle() {
  // The server always renders "light", matching the default before any choice.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);
  return (
    <div role="radiogroup" aria-label="Color theme" className="flex items-center gap-0.5 rounded-xl border border-line bg-sunken p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          title={`${o.label} mode`}
          onClick={() => setTheme(o.value)}
          className={cx(
            "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium transition",
            theme === o.value ? "bg-raised text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.icon}
          <span className="hidden md:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
