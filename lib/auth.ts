/**
 * auth.ts
 * -------
 * NextAuth configuration. Exported as `authOptions` so it can be shared
 * between the API route handler and server-side session checks.
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const ALLOWED_DOMAIN = "beauhurst.com";

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // `hd` restricts Google's account picker to the Beauhurst workspace.
      // This is a UX hint, not security — the signIn/session callbacks below
      // are what actually enforce the restriction server-side.
      authorization: {
        params: {
          hd: ALLOWED_DOMAIN,
        },
      },
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
    // Hard server-side gate: reject any sign-in attempt from a non-Beauhurst
    // email. Returning false blocks JWT creation entirely.
    async signIn({ user }) {
      return isAllowedEmail(user.email);
    },

    // Forward the user's access token into the session so components can
    // read it if needed (e.g. for future API calls on behalf of the user).
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },

    // Defence in depth: also re-check the email on every session read.
    // This invalidates any existing JWTs from before the signIn gate was
    // added — non-Beauhurst users get logged out on their next request
    // rather than remaining signed in until their token expires.
    async session({ session, token }) {
      if (!isAllowedEmail(session.user?.email)) {
        // Returning a session with no user effectively unauthenticates the
        // request. The middleware / page guards treat this as signed out.
        return { ...session, user: undefined } as typeof session;
      }
      // @ts-expect-error — extend the default Session type
      session.accessToken = token.accessToken;
      return session;
    },
  },
};
