import { unstable_cache } from "next/cache";
import type { Contact } from "@/types";

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
