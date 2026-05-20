import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getRecentDashboardEvents } from "@/lib/bigquery";
import { EventsList } from "@/components/events/events-list";

const ALLOWED_DAYS = [7, 30, 90] as const;
type AllowedDays = (typeof ALLOWED_DAYS)[number];

function parseDays(raw: string | string[] | undefined): AllowedDays {
  const n = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  return (ALLOWED_DAYS as readonly number[]).includes(n)
    ? (n as AllowedDays)
    : 7;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { days?: string | string[] };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/signin");
  }

  const days = parseDays(searchParams.days);
  const events = await getRecentDashboardEvents(days);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Events</h1>
        <p className="mt-1 text-sm text-slate-500">
          State changes across the UK5K universe — newest first.
        </p>
      </div>
      <EventsList events={events} days={days} />
    </div>
  );
}
