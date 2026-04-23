/**
 * SnapshotCard — compact at-a-glance summary for the top of a company page.
 * Content branches on customer status and open-deal presence.
 */

import type { ActivityKind, CompanySummary } from "@/types";

interface SnapshotCardProps {
  summary: CompanySummary;
  latestActivity: {
    kind: ActivityKind;
    timestamp: string;
    actorName: string | null;
  } | null;
  /** Days of activity history the "Not been contacted" line refers to */
  activityDaysBack: number;
}

const KIND_LABEL: Record<ActivityKind, string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  note: "Note",
  task: "Task",
};

const GBP_FORMATTER = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function formatGbp(n: number): string {
  return GBP_FORMATTER.format(n);
}

function formatShortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-slate-900">{children}</span>
    </div>
  );
}

function CustomerBadge() {
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Customer
    </span>
  );
}

function ActivityLine({
  kind,
  actorName,
  timestamp,
}: {
  kind: ActivityKind;
  actorName: string | null;
  timestamp: string;
}) {
  const kindLabel = KIND_LABEL[kind];
  const date = formatShortDate(timestamp);
  return (
    <span>
      {kindLabel}
      {actorName ? <> by {actorName}</> : null}
      {" · "}
      <span className="text-slate-500">{date}</span>
    </span>
  );
}

export function SnapshotCard({
  summary,
  latestActivity,
  activityDaysBack,
}: SnapshotCardProps) {
  const ownerDisplay = summary.ownerName ?? (
    <span className="text-slate-400">Unassigned</span>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Snapshot</h2>
      </div>
      <div className="space-y-3 px-4 py-4">
        <Row label="Owner">{ownerDisplay}</Row>

        {summary.isCustomer && (
          <>
            <Row label="Status">
              <CustomerBadge />
            </Row>
            <Row label="ARR">
              {summary.currentArr != null ? (
                <span className="font-medium">{formatGbp(summary.currentArr)}</span>
              ) : (
                <span className="text-slate-400">Not available</span>
              )}
            </Row>
            {latestActivity && (
              <Row label="Latest">
                <ActivityLine
                  kind={latestActivity.kind}
                  actorName={latestActivity.actorName}
                  timestamp={latestActivity.timestamp}
                />
              </Row>
            )}
          </>
        )}

        {!summary.isCustomer && summary.openDeal && (
          <>
            <Row label="Open deal">
              <span>
                <span className="font-medium">{summary.openDeal.name}</span>
                {summary.openDeal.amount != null && (
                  <> — {formatGbp(summary.openDeal.amount)}</>
                )}
                {summary.openDeal.stage && (
                  <span className="text-slate-500"> ({summary.openDeal.stage})</span>
                )}
              </span>
            </Row>
            {latestActivity && (
              <Row label="Latest">
                <ActivityLine
                  kind={latestActivity.kind}
                  actorName={latestActivity.actorName}
                  timestamp={latestActivity.timestamp}
                />
              </Row>
            )}
          </>
        )}

        {!summary.isCustomer && !summary.openDeal && !latestActivity && (
          <p className="text-sm italic text-slate-400">
            Not been contacted in past {Math.round(activityDaysBack / 30)} months
          </p>
        )}

        {!summary.isCustomer && !summary.openDeal && latestActivity && (
          <Row label="Latest">
            <ActivityLine
              kind={latestActivity.kind}
              actorName={latestActivity.actorName}
              timestamp={latestActivity.timestamp}
            />
          </Row>
        )}
      </div>
    </section>
  );
}
