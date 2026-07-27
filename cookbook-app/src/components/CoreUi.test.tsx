import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeCard } from "./RecipeCard";
import { StarRating } from "./StarRating";
import SavedMealPlans from "./SavedMealPlans";
import { UpdateNotifier } from "./UpdateNotifier";
import { apiRequest } from "@/lib/api";

const social = {
  getAverageRating: vi.fn(() => ({ average: 3, count: 2 })),
  isFavorite: vi.fn(() => false),
  toggleFavorite: vi.fn(),
};
const auth = { isAuthenticated: true, user: { isSuperuser: true }, administrationEnabled: false };
const toastMock = vi.fn();

vi.mock("@/hooks/useSocial", () => ({ useSocial: () => social }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: vi.fn() };
});
const apiMock = vi.mocked(apiRequest);

describe("core UI components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    auth.isAuthenticated = true;
    auth.user = { isSuperuser: true };
    social.toggleFavorite.mockResolvedValue(undefined);
  });

  it("renders and operates a recipe card", async () => {
    const onClick = vi.fn();
    render(
      <RecipeCard
        onClick={onClick}
        recipe={{
          id: "1",
          title: "Soup",
          description: "Comfort food",
          servings: 4,
          prepMin: 5,
          cookMin: 10,
          tags: ["Dinner", "Soup"],
          ingredients: [],
          steps: [],
        }}
      />,
    );
    expect(screen.getByText("15 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("heading", { name: "Soup" }));
    expect(onClick).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(social.toggleFavorite).toHaveBeenCalledWith("1"));
  });

  it("supports interactive star ratings and counts", () => {
    const onRate = vi.fn();
    render(<StarRating rating={2.5} interactive onRate={onRate} showCount count={3} size="lg" />);
    fireEvent.click(screen.getAllByRole("button")[3]);
    expect(onRate).toHaveBeenCalledWith(4);
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("renders empty and populated saved meal plans", () => {
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(<SavedMealPlans plans={[]} onLoad={onLoad} onDelete={onDelete} />);
    expect(screen.getByText(/No saved meal plans/)).toBeInTheDocument();

    rerender(
      <SavedMealPlans
        plans={[{
          id: "plan-1",
          name: "Week",
          days: 1,
          mealTypes: ["dinner"],
          dietaryFilters: ["vegetarian"],
          entries: [{ day: 1, mealType: "dinner", recipeId: "1", recipeTitle: "Soup" }],
          createdAt: "2026-01-01T00:00:00Z",
        }]}
        onLoad={onLoad}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByText("Week"));
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ id: "plan-1" }));
  });

  it("shows an update notification once for administrators", async () => {
    apiMock.mockResolvedValueOnce({
      currentVersion: "v1",
      latestVersion: "v2",
      repository: "owner/repo",
      releaseUrl: "https://example.test/release",
      updateAvailable: true,
      updateChecksEnabled: true,
    });
    render(<MemoryRouter><UpdateNotifier /></MemoryRouter>);
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(sessionStorage.getItem("emma-cookbook-update-toast-version")).toBe("v2");
  });
});
