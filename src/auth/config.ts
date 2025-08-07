import type { AuthConfig } from "@auth/core";
import Google from "@auth/core/providers/google";
import { D1Adapter } from "@auth/d1-adapter";

export function getAuthConfig(env: {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_SECRET: string;
  DB: D1Database;
}): AuthConfig {
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    basePath: "/auth",
    session: {
      strategy: "database",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },

    adapter: D1Adapter(env.DB),
    providers: [
      Google({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        authorization: {
          params: {
            scope: "openid email profile https://www.googleapis.com/auth/script.metrics",
          },
        },
      }),
    ],
    callbacks: {
      async session({ session, user }) {
        console.log("Session callback - session:", session);
        console.log("Session callback - user:", user);
        return session;
      },
      async redirect({ url, baseUrl }) {
        console.log("Redirect callback - url:", url);
        console.log("Redirect callback - baseUrl:", baseUrl);
        return "https://gas-metrics-frontend.pages.dev";
      },
    },
  };
}
