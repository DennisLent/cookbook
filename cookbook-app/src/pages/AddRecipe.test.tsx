import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import AddRecipe from "@/pages/AddRecipe";

const apiRequestMock = vi.fn();
const toastMock = vi.fn();
const addRecipeMock = vi.fn();
const ensureAllRecipesLoadedMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  getApiErrorMessage: (error: unknown, fallback: string) =>
    (error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : fallback),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/hooks/useRecipes", () => ({
  useRecipes: () => ({
    recipes: [],
    addRecipe: addRecipeMock,
    ensureAllRecipesLoaded: ensureAllRecipesLoadedMock,
  }),
}));

vi.mock("@/components/SortableStepList", () => ({
  default: () => <div>Sortable steps</div>,
}));

vi.mock("@/components/SearchableRecipeSelect", () => ({
  default: () => <div>Searchable recipe select</div>,
}));

describe("AddRecipe import history", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    toastMock.mockReset();
    addRecipeMock.mockReset();
    ensureAllRecipesLoadedMock.mockClear();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <AddRecipe />
      </MemoryRouter>,
    );
  }

  it("loads a completed recent import back into the draft form", async () => {
    const user = userEvent.setup();

    apiRequestMock.mockImplementation((path: string) => {
      if (path === "/tags/") {
        return Promise.resolve([]);
      }
      if (path === "/recipe-import-jobs/") {
        return Promise.resolve([
          {
            id: 14,
            status: "done",
            progressStage: "done",
            platform: "instagram",
            sourceUrl: "https://www.instagram.com/reel/pasta/",
            videoOnly: false,
            saveVideo: true,
            mediaUrl: "https://cdn.example.com/pasta.mp4",
            result: {
              title: "Creamy Tomato Pasta",
              description: "Weeknight favorite",
              instructions: "Boil pasta\nMake sauce",
              ingredients_data: [{ ingredient: "Pasta", amount: "250g" }],
            },
          },
        ]);
      }
      return Promise.resolve(undefined);
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: "From Link" }));
    await screen.findByText("Recent imports");
    await screen.findByText("https://www.instagram.com/reel/pasta/");

    await user.click(screen.getAllByRole("button", { name: "Load Into Form" })[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Title/i)).toHaveValue("Creamy Tomato Pasta");
    });
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Weeknight favorite");
    expect(screen.getByLabelText(/Recipe Link/i)).toHaveValue("https://www.instagram.com/reel/pasta/");
    expect(screen.getByText("Saved recipe video")).toBeInTheDocument();
  });

  it("retries a failed recent import with the original request settings", async () => {
    const user = userEvent.setup();

    apiRequestMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/tags/") {
        return Promise.resolve([]);
      }
      if (path === "/recipe-import-jobs/" && !init) {
        return Promise.resolve([
          {
            id: 23,
            status: "failed",
            progressStage: "failed",
            platform: "youtube",
            sourceUrl: "https://www.youtube.com/watch?v=abc123xyz98",
            videoOnly: true,
            saveVideo: true,
            errorCode: "download_failed",
            errorMessage: "The video could not be downloaded from the provided URL.",
          },
        ]);
      }
      if (path === "/recipe-import-jobs/" && init?.method === "POST") {
        return Promise.resolve({
          id: 24,
          status: "queued",
          progressStage: "queued",
          platform: "youtube",
          sourceUrl: "https://www.youtube.com/watch?v=abc123xyz98",
          videoOnly: true,
          saveVideo: true,
        });
      }
      return Promise.resolve(undefined);
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: "From Link" }));
    await screen.findByText("https://www.youtube.com/watch?v=abc123xyz98");

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("/recipe-import-jobs/", {
        method: "POST",
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=abc123xyz98",
          videoOnly: true,
          saveVideo: true,
        }),
      });
    });

    expect(screen.getByLabelText(/Recipe Link/i)).toHaveValue("https://www.youtube.com/watch?v=abc123xyz98");
  });
});
