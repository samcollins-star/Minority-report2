import { redirect } from "next/navigation";

/**
 * Root route — immediately redirect to the dashboard.
 * The dashboard will handle auth checking.
 */
export default function RootPage() {
  redirect("/dashboard");
}
