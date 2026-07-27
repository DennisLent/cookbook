import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SocialProvider, useSocial } from "./useSocial";
import { apiRequest } from "@/lib/api";

const refreshRecipe = vi.fn();
const refreshRecipes = vi.fn();
const authState = { user: { id: "7", favoriteRecipeIds: ["1"] }, isAuthenticated: true };
const recipesState = {
  recipes: [{
    id: "1",
    ratings: [{ recipeId: "1", userId: "7", value: 4, createdAt: "2026-01-01" }],
    comments: [
      { id: "old", recipeId: "1", userId: "7", userName: "Chef", text: "Old", createdAt: "2026-01-01" },
      { id: "new", recipeId: "1", userId: "7", userName: "Chef", text: "New", createdAt: "2026-02-01" },
    ],
    my_rating: 4,
  }],
  refreshRecipe,
  refreshRecipes,
};

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/useRecipes", () => ({ useRecipes: () => recipesState }));
vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
const apiMock = vi.mocked(apiRequest);
const wrapper = ({ children }: { children: ReactNode }) => <SocialProvider>{children}</SocialProvider>;

describe("SocialProvider", () => {
  beforeEach(() => {
    apiMock.mockReset().mockResolvedValue(undefined);
    refreshRecipe.mockReset().mockResolvedValue(undefined);
    refreshRecipes.mockReset().mockResolvedValue(undefined);
    authState.user = { id: "7", favoriteRecipeIds: ["1"] };
    authState.isAuthenticated = true;
  });

  it("derives social data and performs mutations", async () => {
    const { result } = renderHook(() => useSocial(), { wrapper });
    expect(result.current.getAverageRating("1")).toEqual({ average: 4, count: 1 });
    expect(result.current.getAverageRating("missing")).toEqual({ average: 0, count: 0 });
    expect(result.current.getUserRating("1")).toBe(4);
    expect(result.current.getRecipeComments("1").map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(result.current.getRecipeSocialData("1").isFavorite).toBe(true);

    await act(() => result.current.toggleFavorite("1"));
    expect(apiMock).toHaveBeenCalledWith("/recipes/1/favorite/", { method: "DELETE" });
    expect(refreshRecipes).toHaveBeenCalled();

    await act(() => result.current.rateRecipe("1", 5));
    expect(apiMock).toHaveBeenCalledWith("/recipes/1/rate/", {
      method: "POST",
      body: JSON.stringify({ stars: 5 }),
    });

    await act(() => result.current.addComment("1", "  Great  "));
    expect(apiMock).toHaveBeenCalledWith("/comments/", {
      method: "POST",
      body: JSON.stringify({ recipe: "1", text: "Great" }),
    });

    await act(() => result.current.deleteComment("old"));
    expect(apiMock).toHaveBeenCalledWith("/comments/old/", { method: "DELETE" });
  });

  it("rejects authenticated actions when signed out", async () => {
    authState.user = null as never;
    authState.isAuthenticated = false;
    const { result } = renderHook(() => useSocial(), { wrapper });
    await expect(result.current.toggleFavorite("1")).rejects.toThrow("logged in");
    await expect(result.current.rateRecipe("1", 5)).rejects.toThrow("logged in");
    await expect(result.current.addComment("1", "text")).rejects.toThrow("logged in");
  });

  it("requires its provider", () => {
    expect(() => renderHook(() => useSocial())).toThrow(
      "useSocial must be used within SocialProvider",
    );
  });
});
