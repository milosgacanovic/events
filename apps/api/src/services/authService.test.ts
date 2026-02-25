import { describe, expect, it } from "vitest";

import { extractRolesFromPayload, matchesExpectedAudience } from "./authService";

describe("extractRolesFromPayload", () => {
  it("extracts realm and client roles without duplicates", () => {
    const roles = extractRolesFromPayload(
      {
        sub: "user-1",
        realm_access: { roles: ["dr_events_editor", "viewer"] },
        resource_access: {
          dr_events_web: { roles: ["dr_events_admin", "viewer"] },
        },
      },
      "dr_events_web",
    );

    expect(roles.sort()).toEqual(["dr_events_admin", "dr_events_editor", "viewer"]);
  });
});

describe("matchesExpectedAudience", () => {
  it("matches when aud equals expected", () => {
    expect(
      matchesExpectedAudience(
        { sub: "user-1", aud: "events" },
        "events",
      ),
    ).toBe(true);
  });

  it("matches when aud array contains expected", () => {
    expect(
      matchesExpectedAudience(
        { sub: "user-1", aud: ["account", "events"] },
        "events",
      ),
    ).toBe(true);
  });

  it("matches on azp when aud differs", () => {
    expect(
      matchesExpectedAudience(
        { sub: "user-1", aud: "account", azp: "events" },
        "events",
      ),
    ).toBe(true);
  });

  it("rejects when neither aud nor azp match", () => {
    expect(
      matchesExpectedAudience(
        { sub: "user-1", aud: "account", azp: "web" },
        "events",
      ),
    ).toBe(false);
  });
});
