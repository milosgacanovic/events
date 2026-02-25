import { describe, expect, it } from "vitest";

import { extractRolesFromPayload } from "./authService";

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
