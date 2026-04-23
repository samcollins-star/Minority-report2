import { unstable_cache } from "next/cache";
import type { Activity, ActivityKind, Contact } from "@/types";

function parseFitScore(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchLiveContactsByCompanyId(companyId: string): Promise<Contact[]> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  }

  const response = await fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "associatedcompanyid",
                operator: "EQ",
                value: companyId,
              },
            ],
          },
        ],
        properties: [
          "firstname",
          "lastname",
          "jobtitle",
          "email",
          "fit_score",
          "notes_last_contacted",
          "hs_lastmodifieddate",
        ],
        limit: 100,
      }),
    }
  );

  if (response.status === 429) {
    throw new Error(`HubSpot rate limit exceeded (429)`);
  }
  if (!response.ok) {
    throw new Error(`HubSpot API error: ${response.status}`);
  }

  const data = await response.json() as {
    results: Array<{
      id: string;
      properties: Record<string, string | null>;
    }>;
  };

  const contacts: Contact[] = (data.results ?? []).map((result) => ({
    id: result.id,
    firstname: result.properties.firstname ?? null,
    lastname: result.properties.lastname ?? null,
    jobtitle: result.properties.jobtitle ?? null,
    email: result.properties.email ?? null,
    fit_score: parseFitScore(result.properties.fit_score),
    notes_last_contacted: result.properties.notes_last_contacted ?? null,
  }));

  return contacts.sort((a, b) => {
    const aHas = a.fit_score != null;
    const bHas = b.fit_score != null;
    if (aHas && bHas) {
      const diff = (b.fit_score as number) - (a.fit_score as number);
      if (diff !== 0) return diff;
    } else if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    return (a.lastname ?? "").localeCompare(b.lastname ?? "");
  });
}

export const getLiveContactsByCompanyId = unstable_cache(
  fetchLiveContactsByCompanyId,
  ["hubspot-contacts"],
  { revalidate: 900, tags: ["hubspot-contacts"] }
);

// ---------------------------------------------------------------------------
// Live activities — calls, meetings, emails, notes, tasks
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makePreview(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 160);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + "…";
}

function parseToEmails(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const parts = raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

type EngagementType = "calls" | "meetings" | "emails" | "notes" | "tasks";

const PROPERTIES_BY_TYPE: Record<EngagementType, string[]> = {
  calls: [
    "hs_call_title",
    "hs_call_body",
    "hs_call_disposition",
    "hs_call_duration",
    "hs_timestamp",
  ],
  meetings: [
    "hs_meeting_title",
    "hs_meeting_body",
    "hs_meeting_outcome",
    "hs_meeting_start_time",
    "hs_meeting_end_time",
    "hs_meeting_location",
    "hs_internal_meeting_notes",
    "hs_timestamp",
  ],
  emails: [
    "hs_email_subject",
    "hs_email_text",
    "hs_email_direction",
    "hs_email_from_email",
    "hs_email_to_email",
    "hs_timestamp",
  ],
  notes: ["hs_note_body", "hs_timestamp"],
  tasks: [
    "hs_task_subject",
    "hs_task_body",
    "hs_task_status",
    "hs_task_priority",
    "hs_timestamp",
  ],
};

const KIND_BY_TYPE: Record<EngagementType, ActivityKind> = {
  calls: "call",
  meetings: "meeting",
  emails: "email",
  notes: "note",
  tasks: "task",
};

interface SearchResult {
  id: string;
  properties: Record<string, string | null>;
}

async function searchEngagements(
  type: EngagementType,
  token: string,
  companyId: string,
  cutoffMs: number,
  perTypeLimit: number
): Promise<SearchResult[]> {
  const response = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${type}/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "associations.company",
                operator: "EQ",
                value: companyId,
              },
              {
                propertyName: "hs_timestamp",
                operator: "GTE",
                value: String(cutoffMs),
              },
            ],
          },
        ],
        sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
        properties: PROPERTIES_BY_TYPE[type],
        limit: Math.min(perTypeLimit, 100),
      }),
    }
  );

  if (response.status === 429) {
    throw new Error(`HubSpot rate limit exceeded (429)`);
  }
  if (!response.ok) {
    throw new Error(`HubSpot ${type} search error: ${response.status}`);
  }

  const data = (await response.json()) as { results?: SearchResult[] };
  return data.results ?? [];
}

function mapToActivity(type: EngagementType, r: SearchResult): Activity | null {
  const kind = KIND_BY_TYPE[type];
  const p = r.properties;
  const timestamp = p.hs_timestamp ?? "";
  // HubSpot returns hs_timestamp as an ISO string; keep as-is.

  if (kind === "call") {
    const body = stripHtml(p.hs_call_body);
    const durRaw = p.hs_call_duration;
    const durationMs = durRaw != null && durRaw !== "" ? Number(durRaw) : null;
    return {
      id: r.id,
      kind,
      timestamp,
      title: p.hs_call_title ?? "Call",
      body: body || null,
      preview: body ? makePreview(body) : null,
      meta: {
        disposition: p.hs_call_disposition ?? null,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
      },
    };
  }

  if (kind === "meeting") {
    const body = stripHtml(p.hs_meeting_body);
    const notes = stripHtml(p.hs_internal_meeting_notes);
    return {
      id: r.id,
      kind,
      timestamp,
      title: p.hs_meeting_title ?? "Meeting",
      body: body || null,
      preview: body ? makePreview(body) : null,
      meta: {
        outcome: p.hs_meeting_outcome ?? null,
        startTime: p.hs_meeting_start_time ?? null,
        endTime: p.hs_meeting_end_time ?? null,
        location: p.hs_meeting_location ?? null,
        internalNotes: notes || null,
      },
    };
  }

  if (kind === "email") {
    const body = stripHtml(p.hs_email_text);
    const direction = p.hs_email_direction as Activity["meta"]["direction"] | null | undefined;
    return {
      id: r.id,
      kind,
      timestamp,
      title: p.hs_email_subject ?? "Email",
      body: body || null,
      preview: body ? makePreview(body) : null,
      meta: {
        direction: direction ?? null,
        fromEmail: p.hs_email_from_email ?? null,
        toEmails: parseToEmails(p.hs_email_to_email),
      },
    };
  }

  if (kind === "note") {
    const body = stripHtml(p.hs_note_body);
    const titleFromBody = body ? body.slice(0, 80) : "";
    return {
      id: r.id,
      kind,
      timestamp,
      title: titleFromBody || "Note",
      body: body || null,
      preview: body ? makePreview(body) : null,
      meta: {},
    };
  }

  if (kind === "task") {
    const body = stripHtml(p.hs_task_body);
    return {
      id: r.id,
      kind,
      timestamp,
      title: p.hs_task_subject ?? "Task",
      body: body || null,
      preview: body ? makePreview(body) : null,
      meta: {
        status: p.hs_task_status ?? null,
        priority: p.hs_task_priority ?? null,
      },
    };
  }

  return null;
}

async function fetchLiveActivitiesByCompanyId(
  companyId: string,
  daysBack: number = 60,
  limit: number = 20
): Promise<Activity[]> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  }

  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const safeDays = Math.max(1, Math.min(365, Math.floor(daysBack)));
  const cutoffMs = Date.now() - safeDays * 86_400_000;
  const perTypeLimit = Math.min(100, safeLimit * 2);

  const types: EngagementType[] = ["calls", "meetings", "emails", "notes", "tasks"];
  const settled = await Promise.allSettled(
    types.map((t) => searchEngagements(t, token, companyId, cutoffMs, perTypeLimit))
  );

  const merged: Activity[] = [];
  settled.forEach((result, i) => {
    const type = types[i];
    if (result.status === "rejected") {
      console.error(`[hubspot-activities] ${type} fetch failed:`, result.reason);
      return;
    }
    for (const row of result.value) {
      const a = mapToActivity(type, row);
      if (a) merged.push(a);
    }
  });

  merged.sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0
  );
  return merged.slice(0, safeLimit);
}

export const getLiveActivitiesByCompanyId = unstable_cache(
  fetchLiveActivitiesByCompanyId,
  ["hubspot-activities"],
  { revalidate: 600, tags: ["hubspot-activities"] }
);
