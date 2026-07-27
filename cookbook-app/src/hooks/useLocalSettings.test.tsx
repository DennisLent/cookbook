import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSavedMealPlans } from "./useSavedMealPlans";
import { SettingsProvider, useSettings } from "./useSettings";

describe("local state hooks", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: () => "plan-id" });
  });

  it("saves, renames, persists, and deletes meal plans", async () => {
    const { result } = renderHook(() => useSavedMealPlans());
    act(() => {
      result.current.savePlan({
        name: "Week",
        days: 1,
        mealTypes: ["dinner"],
        dietaryFilters: [],
        entries: [],
      });
    });
    expect(result.current.savedPlans[0].id).toBe("plan-id");
    act(() => result.current.renamePlan("plan-id", "Updated"));
    expect(result.current.savedPlans[0].name).toBe("Updated");
    await waitFor(() => expect(localStorage.getItem("cookbook-saved-meal-plans")).toContain("Updated"));
    act(() => result.current.deletePlan("plan-id"));
    expect(result.current.savedPlans).toEqual([]);
  });

  it("loads and updates display settings", async () => {
    localStorage.setItem("cookbook-settings", JSON.stringify({
      siteTitle: "Kitchen",
      accentColor: "#fff",
      theme: "dark",
    }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SettingsProvider>{children}</SettingsProvider>
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings.siteTitle).toBe("Kitchen");
    act(() => result.current.updateSettings({ theme: "light" }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "light"));
  });
});
