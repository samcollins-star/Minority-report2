/**
 * ContactsTable — lists the contacts associated with a company.
 */

import type { Contact } from "@/types";

interface ContactsTableProps {
  contacts: Contact[];
}

export function ContactsTable({ contacts }: ContactsTableProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">
          Contacts{" "}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {contacts.length}
          </span>
        </h2>
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
                <th className="px-6 py-3 font-medium text-slate-500">Email</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
