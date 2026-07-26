import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Login from "@/pages/Login";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";

const authState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState.current,
}));

const sharedUser = {
  id: "1",
  name: "Cookbook Owner",
  username: "__single_user__",
  isSuperuser: false,
  preferencesVersion: 1,
  prefs: {
    theme: "light",
    colorScheme: "default",
    density: "cozy",
    cookFontSize: "normal",
    highContrast: false,
    reduceMotion: false,
  },
};

describe("mode-aware quality-of-life UI", () => {
  beforeEach(() => {
    authState.current = {
      user: sharedUser,
      isAuthenticated: true,
      authenticationRequired: false,
      registrationEnabled: false,
      passwordManagementEnabled: false,
      administrationEnabled: false,
      mode: "single_user",
      login: vi.fn(),
      signup: vi.fn(),
      updateProfile: vi.fn(),
      updatePreferences: vi.fn(),
      refreshProfile: vi.fn(),
      changePassword: vi.fn(),
    };
  });

  it("labels the shared-owner profile as Preferences", () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.queryByText("Change Password")).not.toBeInTheDocument();
  });

  it("shows mode diagnostics and the single-user access warning", () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(screen.getByText("Single-user (shared owner)")).toBeInTheDocument();
    expect(screen.getByText(/Everyone who can reach this instance/)).toBeInTheDocument();
  });

  it("uses a one-column login tab layout when registration is unavailable", () => {
    authState.current = {
      ...authState.current,
      authenticationRequired: true,
      mode: "multi_user",
    };
    render(<MemoryRouter><Login /></MemoryRouter>);
    const loginTab = screen.getByRole("tab", { name: "Login" });
    expect(loginTab.parentElement).toHaveClass("grid-cols-1");
    expect(screen.queryByRole("tab", { name: "Sign Up" })).not.toBeInTheDocument();
  });
});
