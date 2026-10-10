import { CATEGORY_META, type CategoryScore } from "@/lib/audit/types";
import { cx, scoreColor } from "./ui";

export function CategoryBars({
  scores,
  compact,
  onSelect,
  active,
}: {
  scores: CategoryScore[];
  compact?: boolean;
  onSelect?: (c: CategoryScore["category"]) => void;
  active?: string | null;
}) {
  return (
    <ul className={cx("flex flex-col", compact ? "gap-2" : "gap-1")}>
      {scores.map((c) => {
        const Row = onSelect ? "button" : "div";
        return (
          <li key={c.category}>
            <Row
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(c.category) } : {})}
              className={cx(
                "group grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-lg text-left",
                !compact && "px-2.5 py-2",
                onSelect && "transition hover:bg-sunken",
                active === c.category && "bg-sunken",
              )}
            >
              <span className="text-[13px] text-ink-2">{CATEGORY_META[c.category].label}</span>
              <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: scoreColor(c.score) }}>
                {c.score ?? "–"}
              </span>
              <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <span
                  className="block h-full rounded-full transition-[width] duration-1000 ease-out"
                  style={{ width: `${c.score ?? 0}%`, background: scoreColor(c.score) }}
                />
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
