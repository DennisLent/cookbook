import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/lib/api";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

const profile = {
  id: "1",
  username: "__single_user__",
  name: "Cookbook Owner",
  prefs: {},
  favorite_recipe_ids: [],
};

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.mode}</span>
      <span>{auth.authenticationRequired ? "login-required" : "shared-owner"}</span>
      <span>{auth.user?.username}</span>
    </div>
  );
}

describe("AuthProvider runtime mode bootstrap", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears stale credentials and loads the shared owner in single-user mode", async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, "stale-access");
    localStorage.setItem(REFRESH_TOKEN_KEY, "stale-refresh");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        mode: "single_user",
        authenticationRequired: false,
        registrationEnabled: false,
        authProvider: "none",
        profileEnabled: true,
        passwordManagementEnabled: false,
        administrationEnabled: true,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText("shared-owner")).toBeInTheDocument();
    expect(screen.getByText("__single_user__")).toBeInTheDocument();
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/app/config/");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/users/me/");
  });

  it("keeps an anonymous multi-user session when profile bootstrap is unauthorized", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        mode: "multi_user",
        authenticationRequired: true,
        registrationEnabled: true,
        authProvider: "jwt",
        profileEnabled: true,
        passwordManagementEnabled: true,
        administrationEnabled: false,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByText("login-required")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
