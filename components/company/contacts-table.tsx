/**
 * ContactsTable — lists the contacts associated with a company.
 */

import type { Contact } from "@/types";

const SENIORITY_LABELS: Record<string, string> = {
  c_suite: "C-Suite",
  vp: "VP",
  director: "Director",
  manager: "Manager",
  individual_contributor: "IC",
  entry_level: "Entry Level",
  intern: "Intern",
  other: "Other",
  unassigned: "—",
};

function formatSeniority(s: string | null | undefined): string {
  if (!s) return "—";
  return SENIORITY_LABELS[s.toLowerCase()] ?? s;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

interface ContactsTableProps {
  contacts: Contact[];
  /** When true, data came from the BigQuery fallback rather than live HubSpot */
  fallback?: boolean;
}

export function ContactsTable({ contacts, fallback }: ContactsTableProps) {
  const hasLiveFields = contacts.some(
    (c) => c.hs_seniority !== undefined || c.notes_last_contacted !== undefined
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          Contacts{" "}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {contacts.length}
          </span>
        </h2>
        {fallback && (
          <p className="mt-1 text-xs text-slate-400">
            Showing historic contacts — live data temporarily unavailable.
          </p>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-400">
          No contacts found for this company.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-6 py-3 font-medium text-slate-500">Name</th>
                <th className="px-4 py-3 font-medium text-slate-500">
                  Job title
                </th>
                {hasLiveFields && (
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Seniority
                  </th>
                )}
                <th className="px-6 py-3 font-medium text-slate-500">Email</th>
                {hasLiveFields && (
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Last contacted
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="transition-colors hover:bg-slate-50"
                >
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {[contact.firstname, contact.lastname]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {contact.jobtitle ?? "—"}
                  </td>
                  {hasLiveFields && (
                    <td className="px-4 py-3 text-slate-600">
                      {formatSeniority(contact.hs_seniority)}
                    </td>
                  )}
                  <td className="px-6 py-3">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {contact.email}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {hasLiveFields && (
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(contact.notes_last_contacted)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
