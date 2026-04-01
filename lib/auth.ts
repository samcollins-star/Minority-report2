/**
 * auth.ts
 * -------
 * NextAuth configuration. Exported as `authOptions` so it can be shared
 * between the API route handler and server-side session checks.
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  // Use the default JWT strategy — no database adapter needed
  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/auth/signin",
  },

  callbacks: {
    // Forward the user's access token into the session so components can
    // read it if needed (e.g. for future API calls on behalf of the user).
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // @ts-expect-error — extend the default Session type
      session.accessToken = token.accessToken;
      return session;
    },
  },
};
