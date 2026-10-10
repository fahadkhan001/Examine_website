"use client";

import { useEffect, useState } from "react";
import { cx, gradeColor } from "./ui";

/** Signature element: animated ring with the grade letter. */
export function ScoreRing({ score, grade, size = 168, className }: { score: number; grade: string; size?: number; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const stroke = Math.max(8, size / 14);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = gradeColor(grade);
  return (
    <div className={cx("relative shrink-0", className)} style={{ width: size, height: size }} role="img" aria-label={`Score ${score} out of 100, grade ${grade}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (shown / 100) * c}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.2, 0.7, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold leading-none tracking-tight" style={{ color, fontSize: size * 0.36 }}>{grade}</span>
        {size >= 96 && (
          <span className="mt-1 font-mono text-muted" style={{ fontSize: Math.max(11, size * 0.075) }}>
            {score}<span className="opacity-60">/100</span>
          </span>
        )}
      </div>
    </div>
  );
}
