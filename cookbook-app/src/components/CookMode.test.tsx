import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CookMode } from "@/components/CookMode";
import { Recipe } from "@/types/recipe";

describe("CookMode", () => {
  const recipe: Recipe = {
    id: "1",
    title: "Test Recipe",
    servings: 2,
    tags: [],
    ingredients: [
      { qty: "1/2", item: "cup sugar" },
      { qty: "1;globalThis.__cookmode_hacked=true", item: "cup milk" },
    ],
    steps: [{ order: 1, text: "Mix ingredients." }],
  };

  it("scales fractions without using eval-like execution", async () => {
    const user = userEvent.setup();
    render(<CookMode recipe={recipe} onClose={vi.fn()} />);

    expect(screen.getByText("0.5 cup sugar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Increase servings" }));
    expect(screen.getByText("0.75 cup sugar")).toBeInTheDocument();
    expect((globalThis as { __cookmode_hacked?: boolean }).__cookmode_hacked).toBeUndefined();
  });

  it("keeps the mobile footer controls in the viewport-safe shell", () => {
    const { container } = render(<CookMode recipe={recipe} onClose={vi.fn()} />);

    expect(container.querySelector(".h-dvh")).toBeTruthy();
    expect(container.querySelector(".min-h-0.flex-1.overflow-y-auto")).toBeTruthy();
    expect(container.querySelector(".pb-\\[calc\\(env\\(safe-area-inset-bottom\\)\\+1rem\\)\\]")).toBeTruthy();
  });
});
