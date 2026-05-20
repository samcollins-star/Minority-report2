"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

export function DateRangeSelect({ value }: { value: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set("days", e.target.value);
    startTransition(() => {
      router.replace(`/events?${next.toString()}`);
    });
  }

  return (
    <select
      value={String(value)}
      onChange={onChange}
      aria-label="Event date range"
      className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
