import { unstable_cache } from "next/cache";
import type { Contact } from "@/types";

// HubSpot hs_seniority enum → display rank (lower = more senior)
const SENIORITY_RANK: Record<string, number> = {
  c_suite: 0,
  vp: 1,
  director: 2,
  manager: 3,
  individual_contributor: 4,
  entry_level: 5,
  intern: 6,
  other: 7,
  unassigned: 8,
};

function seniorityRank(s: string | null | undefined): number {
  if (!s) return 99;
  return SENIORITY_RANK[s.toLowerCase()] ?? 8;
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
          "hs_seniority",
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
    hs_seniority: result.properties.hs_seniority ?? null,
    notes_last_contacted: result.properties.notes_last_contacted ?? null,
  }));

  return contacts.sort((a, b) => {
    const sr = seniorityRank(a.hs_seniority) - seniorityRank(b.hs_seniority);
    if (sr !== 0) return sr;
    return (a.lastname ?? "").localeCompare(b.lastname ?? "");
  });
}

export const getLiveContactsByCompanyId = unstable_cache(
  fetchLiveContactsByCompanyId,
  ["hubspot-contacts"],
  { revalidate: 900, tags: ["hubspot-contacts"] }
);
