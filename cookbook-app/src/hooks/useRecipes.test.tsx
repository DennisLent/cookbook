import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecipesProvider, useRecipes } from "./useRecipes";
import { apiRequest } from "@/lib/api";
import type { Recipe } from "@/types/recipe";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
const apiMock = vi.mocked(apiRequest);
const wrapper = ({ children }: { children: ReactNode }) => <RecipesProvider>{children}</RecipesProvider>;
const recipe = (id: string, title = `Recipe ${id}`): Recipe => ({
  id,
  title,
  servings: 2,
  tags: [],
  ingredients: [],
  steps: [],
});

describe("RecipesProvider", () => {
  beforeEach(() => {
    apiMock.mockReset();
    vi.stubGlobal("URL", URL);
  });

  it("loads pages and supports CRUD operations", async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      ...recipe(String(index + 1)),
      id: index + 1,
    }));
    apiMock.mockResolvedValueOnce({
      count: 26,
      next: "http://localhost/api/recipes/?page=2",
      results: firstPage,
    });
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recipes[0].id).toBe("1");
    expect(result.current.hasMoreRecipes).toBe(true);

    apiMock.mockResolvedValueOnce({ count: 26, next: null, results: [recipe("26")] });
    await act(() => result.current.loadMoreRecipes());
    expect(result.current.recipes).toHaveLength(26);

    apiMock.mockResolvedValueOnce(recipe("3"));
    await act(() => result.current.addRecipe({ ...recipe("x"), id: undefined } as never));
    expect(result.current.recipes[0].id).toBe("3");

    apiMock.mockResolvedValueOnce(recipe("3", "Updated"));
    await act(() => result.current.updateRecipe("3", { ...recipe("x"), id: undefined } as never));
    expect(result.current.recipes[0].title).toBe("Updated");

    apiMock.mockResolvedValueOnce(undefined);
    await act(() => result.current.deleteRecipe("3"));
    expect(result.current.recipes.some((entry) => entry.id === "3")).toBe(false);
  });

  it("refreshes a single recipe and imports a list", async () => {
    apiMock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    apiMock.mockResolvedValueOnce(recipe("8"));
    await act(() => result.current.refreshRecipe("8"));
    expect(result.current.totalRecipes).toBe(1);

    apiMock.mockResolvedValueOnce(recipe("9"));
    await act(() => result.current.importRecipes([recipe("source")]));
    expect(result.current.recipes.map((entry) => entry.id)).toContain("9");
  });

  it("handles initial load failure and requires its provider", async () => {
    apiMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recipes).toEqual([]);
    expect(() => renderHook(() => useRecipes())).toThrow(
      "useRecipes must be used within RecipesProvider",
    );
  });
});
