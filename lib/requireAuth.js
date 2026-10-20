// Server-side route guard for Pages Router pages (getServerSideProps).

import { getUserFromRequest } from "./auth.js";

/**
 * Redirects to /login when no valid session cookie is present.
 * Usage in a page:
 *   export async function getServerSideProps(ctx) { return requireAuth(ctx); }
 */
export function requireAuth(ctx) {
  const user = getUserFromRequest(ctx.req);
  if (!user) {
    const next = ctx.resolvedUrl || "/dashboard";
    return {
      redirect: {
        destination: `/login?next=${encodeURIComponent(next)}`,
        permanent: false
      }
    };
  }
  return { props: { user } };
}
