"use client";

import { useEffect, useState } from "react";

interface ScoreRingProps {
  score: number; // 0-100
  color: string;
  label: string;
}

// 风险评分环形仪表，数字 0 -> 目标值滚动
export function ScoreRing({ score, color, label }: ScoreRingProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(score * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (display / 100) * c;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="#1f2430"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono-risk text-4xl font-semibold leading-none"
            style={{ color }}
          >
            {display}
          </span>
          <span className="mt-1 text-xs text-[#8b93a7]">风险分</span>
        </div>
      </div>
      <span
        className="rounded-md px-3 py-1 text-sm font-semibold tracking-wide"
        style={{
          color,
          backgroundColor: `${color}1f`,
          border: `1px solid ${color}40`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
