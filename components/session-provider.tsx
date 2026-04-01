"use client";

/**
 * A thin wrapper around NextAuth's SessionProvider.
 * This must be a client component because SessionProvider uses React context.
 * We put it here so the root layout (which is a server component) can import it.
 */

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

interface Props {
  children: React.ReactNode;
  session: Session | null;
}

export function SessionProvider({ children, session }: Props) {
  return (
    <NextAuthSessionProvider session={session}>
      {children}
    </NextAuthSessionProvider>
  );
}
