import { describe, expect, it } from "vitest";

import { isAuthPage, isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it("lets signed-out people reach login, signup, auth callbacks, the scheduled job and unsubscribe links", () => {
    for (const p of ["/login", "/signup", "/auth/callback", "/api/cron/rates", "/unsubscribe/abc.def"]) expect(isPublicPath(p), p).toBe(true);
  });

  it("keeps the app and the chat API private", () => {
    for (const p of ["/", "/costs", "/profit/direct/rates", "/api/chat", "/actions", "/setup-problem", "/onboarding"]) expect(isPublicPath(p), p).toBe(false);
  });

  it("does not treat lookalike paths as public", () => {
    for (const p of ["/loginx", "/api/cronjob", "/api/cron", "/unsubscribe", "/authx/callback", "/x/login"]) expect(isPublicPath(p), p).toBe(false);
  });
});

describe("isAuthPage", () => {
  it("is only login and signup, which signed-in people are sent away from", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/signup")).toBe(true);
    expect(isAuthPage("/auth/callback")).toBe(false);
  });
});
