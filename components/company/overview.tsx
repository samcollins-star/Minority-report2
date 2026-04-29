/**
 * CompanyOverview — displays the headline company fields in a definition-list style.
 */

import type { Company } from "@/types";

interface CompanyOverviewProps {
  company: Company;
}

/** Pill badge — used for boolean attributes */
function Badge({
  active,
  activeLabel,
  inactiveLabel,
  activeColor,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeColor: "emerald" | "violet";
}) {
  const activeClass =
    activeColor === "emerald"
      ? "bg-emerald-600 text-white"
      : "bg-violet-600 text-white";
  return (
    <span
      className={[
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        active ? activeClass : "bg-slate-100 text-slate-600",
      ].join(" ")}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** A single labelled field row */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-0">
      <dt className="w-full text-sm font-medium text-slate-500 sm:w-48 sm:shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function CompanyOverview({ company }: CompanyOverviewProps) {
  const isCustomer = company.planhat_customer_status === "customer";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">Overview</h2>
      </div>
      <dl className="divide-y divide-slate-100 px-6 py-4 space-y-0">
        <div className="py-3">
          <Field label="Company name">{company.name ?? "—"}</Field>
        </div>
        <div className="py-3">
          <Field label="Customer status">
            <Badge
              active={isCustomer}
              activeLabel="Customer"
              inactiveLabel="Not a customer"
              activeColor="emerald"
            />
          </Field>
        </div>
        <div className="py-3">
          <Field label="Target account">
            <Badge
              active={Boolean(company.hs_is_target_account)}
              activeLabel="Yes — target account"
              inactiveLabel="No"
              activeColor="violet"
            />
          </Field>
        </div>
        <div className="py-3">
          <Field label="Product group">
            {company.beauhurst_product ?? "—"}
          </Field>
        </div>
        <div className="py-3">
          <Field label="Industry">
            {company.new_beauhurst_industries ?? "—"}
          </Field>
        </div>
        <div className="py-3">
          <Field label="UK headcount">
            {company.uk_headcount_uk5k ?? "—"}
          </Field>
        </div>
        <div className="py-3">
          <Field label="Global headcount">
            {company.global_headcount_uk5k ?? "—"}
          </Field>
        </div>
        <div className="py-3">
          <Field label="Last sales activity">
            {formatDate(company.hs_last_sales_activity_timestamp)}
          </Field>
        </div>
        <div className="py-3">
          <Field label="Company owner">
            {company.owner_name ? (
              company.owner_name
            ) : (
              <span className="text-slate-400">Unassigned</span>
            )}
          </Field>
        </div>
      </dl>
    </section>
  );
}
