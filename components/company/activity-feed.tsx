/**
 * ActivityFeed — lists recent calls and meetings on a company detail page.
 * Each row is collapsed by default (icon + date + title + preview) and
 * expands in place to show the full body and kind-specific metadata.
 */

"use client";

import { useState } from "react";
import type { Activity, ActivityKind } from "@/types";

interface ActivityFeedProps {
  companyId: string;
  initial: Activity[];
  portalId: string;
  /** The initial window the server fetched, in days. Used for the empty-state copy. */
  initialDays?: number;
}

export function ActivityFeed({
  companyId,
  initial,
  portalId,
  initialDays = 60,
}: ActivityFeedProps) {
  const [items, setItems] = useState<Activity[]>(initial);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showingOlder, setShowingOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const loadOlder = async () => {
    setLoadingOlder(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/companies/${companyId}/activity?days=180&limit=50`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const older = (await res.json()) as Activity[];
      setItems(older);
      setShowingOlder(true);
    } catch (err) {
      console.error("[activity] failed to load older:", err);
      setLoadError("Couldn't load older activity. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  };

  // If we're already showing the full 60-day window at the default cap of 20,
  // there may be more available in a wider window. Not perfectly accurate
  // (there could be exactly 20 and no older), but acceptable for v1.
  const canShowOlder = !showingOlder && items.length >= 20;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          Activity{" "}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {items.length}
          </span>
        </h2>
        {showingOlder && (
          <span className="text-xs text-slate-400">Last 180 days</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-400">
          No activity in the last {showingOlder ? 180 : initialDays} days.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <ActivityRow
              key={`${item.kind}:${item.id}`}
              item={item}
              companyId={companyId}
              portalId={portalId}
              expanded={expanded.has(item.id)}
              onToggle={() => toggle(item.id)}
            />
          ))}
        </ul>
      )}

      {(canShowOlder || loadError) && (
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-3">
          {loadError && (
            <span className="text-xs text-rose-600">{loadError}</span>
          )}
          {canShowOlder && (
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800 disabled:opacity-50"
            >
              {loadingOlder ? "Loading…" : "Show older"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface ActivityRowProps {
  item: Activity;
  companyId: string;
  portalId: string;
  expanded: boolean;
  onToggle: () => void;
}

function ActivityRow({ item, companyId, portalId, expanded, onToggle }: ActivityRowProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="flex cursor-pointer items-start gap-3 px-6 py-4 transition-colors hover:bg-slate-50"
      >
        <span
          className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
            item.kind === "call"
              ? "bg-emerald-50 text-emerald-600"
              : "bg-indigo-50 text-indigo-600"
          }`}
          aria-hidden="true"
        >
          {item.kind === "call" ? <PhoneIcon /> : <CalendarIcon />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-slate-900">
              {item.title ?? defaultTitle(item.kind)}
            </span>
            <span
              className="text-xs text-slate-400"
              title={formatAbsolute(item.timestamp)}
            >
              {formatRelative(item.timestamp)}
            </span>
          </div>

          {!expanded && item.preview && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {item.preview}
            </p>
          )}

          {expanded && (
            <div className="mt-3 space-y-3">
              <ActivityMeta item={item} />
              {item.body ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
                  {item.body}
                </pre>
              ) : (
                <p className="text-xs italic text-slate-400">No body</p>
              )}
              {item.kind === "meeting" && item.meta.internalNotes && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Internal notes
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
                    {item.meta.internalNotes}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <a
          href={hubspotUrl(item.kind, item.id, companyId, portalId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open in HubSpot"
          className="ml-2 flex-shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <ExternalLinkIcon />
          <span className="sr-only">Open in HubSpot</span>
        </a>
      </div>
    </li>
  );
}

function ActivityMeta({ item }: { item: Activity }) {
  const rows: Array<[string, string]> = [];
  if (item.kind === "call") {
    if (item.meta.disposition)
      rows.push(["Disposition", humanise(item.meta.disposition)]);
    const dur = formatDuration(item.meta.durationMs);
    if (dur) rows.push(["Duration", dur]);
  } else {
    if (item.meta.outcome)
      rows.push(["Outcome", humanise(item.meta.outcome)]);
    if (item.meta.location) rows.push(["Location", item.meta.location]);
    const window = formatMeetingWindow(item.meta.startTime, item.meta.endTime);
    if (window) rows.push(["When", window]);
  }
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-medium text-slate-400">{label}</dt>
          <dd className="text-slate-600">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function defaultTitle(kind: ActivityKind): string {
  return kind === "call" ? "Call" : "Meeting";
}

function hubspotUrl(
  kind: ActivityKind,
  engagementId: string,
  companyId: string,
  portalId: string
): string {
  // Engagements don't have standalone record pages — they're highlighted on
  // the parent company's timeline via ?engagement=<id>&type=<TYPE>.
  const type = kind === "call" ? "CALL" : "MEETING";
  return `https://app.hubspot.com/contacts/${portalId}/record/0-2/${companyId}/view/1?engagement=${engagementId}&type=${type}`;
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const now = Date.now();
  const diffMs = now - t;
  const past = diffMs >= 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  if (days > 30) {
    return new Date(t).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const phrase = days >= 1
    ? pluralise(days, "day")
    : hours >= 1
    ? pluralise(hours, "hour")
    : mins >= 1
    ? pluralise(mins, "min")
    : "just now";
  if (phrase === "just now") return phrase;
  return past ? `${phrase} ago` : `in ${phrase}`;
}

function pluralise(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function formatAbsolute(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} sec`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`;
}

function formatMeetingWindow(
  startIso: string | null | undefined,
  endIso: string | null | undefined
): string | null {
  if (!startIso) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const datePart = start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const startPart = start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!endIso) return `${datePart}, ${startPart}`;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return `${datePart}, ${startPart}`;
  const endPart = end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${startPart}–${endPart}`;
}

function humanise(raw: string): string {
  // Turn "CONNECTED" or "no_show" into "Connected" / "No show".
  return raw
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PhoneIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
