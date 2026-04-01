"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

/**
 * Top navigation bar — shown on all authenticated pages.
 */
export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/companies", label: "Companies" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Wordmark */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900"
        >
          {/* Simple geometric accent mark */}
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white text-xs font-black">
            MR
          </span>
          <span>Minority Report</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={[
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* User menu */}
        <div className="flex items-center gap-3">
          {session?.user?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt={session.user.name ?? "User avatar"}
              className="h-7 w-7 rounded-full ring-2 ring-white"
            />
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
