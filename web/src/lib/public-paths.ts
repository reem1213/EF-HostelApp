/** Pages signed-out people may open. Everything else needs a session. */

export const isAuthPage = (path: string): boolean => path === "/login" || path === "/signup";

export const isPublicPath = (path: string): boolean =>
  isAuthPage(path) ||
  path.startsWith("/auth/") ||
  // The scheduled job proves itself with a secret instead of a session.
  path.startsWith("/api/cron/") ||
  // Guests click this from an email and have no account.
  path.startsWith("/unsubscribe/");
