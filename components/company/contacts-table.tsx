/**
 * ContactsTable — lists the contacts associated with a company.
 */

"use client";

import { useState } from "react";
import type { Contact } from "@/types";

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "329016";

function formatFitScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
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
  const [expanded, setExpanded] = useState(false);
  const hasFitScore = contacts.some((c) => c.fit_score != null);
  const hasLastContacted = contacts.some((c) => c.notes_last_contacted !== undefined);

  const canTruncate = contacts.length > 5;
  const visibleContacts = canTruncate && !expanded ? contacts.slice(0, 5) : contacts;

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
                {hasFitScore && (
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Fit Score
                  </th>
                )}
                <th className="px-6 py-3 font-medium text-slate-500">Email</th>
                {hasLastContacted && (
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Last contacted
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleContacts.map((contact) => {
                const displayName =
                  [contact.firstname, contact.lastname]
                    .filter(Boolean)
                    .join(" ") || "—";
                return (
                  <tr
                    key={contact.id}
                    className="transition-colors hover:bg-slate-50"
                  >
                    <td className="px-6 py-3 font-medium">
                      {contact.id ? (
                        <a
                          href={`https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${contact.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-900 hover:text-indigo-700 hover:underline"
                        >
                          {displayName}
                        </a>
                      ) : (
                        <span className="text-slate-900">{displayName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.jobtitle ?? "—"}
                    </td>
                    {hasFitScore && (
                      <td className="px-4 py-3 text-slate-600">
                        {formatFitScore(contact.fit_score)}
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
                    {hasLastContacted && (
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(contact.notes_last_contacted)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canTruncate && (
        <div className="flex items-center justify-end border-t border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800"
          >
            {expanded ? "Show less" : `Show more (+${contacts.length - 5})`}
          </button>
        </div>
      )}
    </section>
  );
}
