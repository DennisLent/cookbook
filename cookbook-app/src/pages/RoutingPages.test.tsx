import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import NotFound from "./NotFound";
import RecipePage from "./RecipePage";

const refreshRecipe = vi.fn();
const recipeState = {
  recipes: [] as Array<{ id: string; title: string }>,
  isLoading: false,
  refreshRecipe,
};

vi.mock("@/hooks/useRecipes", () => ({ useRecipes: () => recipeState }));
vi.mock("@/components/RecipeDetail", () => ({
  RecipeDetail: ({ onStartCookMode }: { onStartCookMode: () => void }) => (
    <button onClick={onStartCookMode}>Start cooking</button>
  ),
}));
vi.mock("@/components/CookMode", () => ({
  CookMode: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Close cooking</button>,
}));

describe("routing pages", () => {
  it("renders the not-found route", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<MemoryRouter initialEntries={["/missing"]}><NotFound /></MemoryRouter>);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(error).toHaveBeenCalledWith(
      "404 Error: User attempted to access non-existent route:",
      "/missing",
    );
    error.mockRestore();
  });

  it("loads a missing recipe and switches into cook mode", async () => {
    refreshRecipe.mockReset().mockResolvedValue(undefined);
    recipeState.recipes = [];
    const { rerender } = render(
      <MemoryRouter initialEntries={["/recipes/7"]}>
        <Routes><Route path="/recipes/:id" element={<RecipePage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(refreshRecipe).toHaveBeenCalledWith("7"));
    expect(screen.getByText("Recipe not found")).toBeInTheDocument();

    recipeState.recipes = [{ id: "7", title: "Soup" }];
    rerender(
      <MemoryRouter initialEntries={["/recipes/7"]}>
        <Routes><Route path="/recipes/:id" element={<RecipePage />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Start cooking"));
    expect(screen.getByText("Close cooking")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close cooking"));
    expect(screen.getByText("Start cooking")).toBeInTheDocument();
  });
});
