import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api";

test("single-user owner workflow persists without login", async ({ page, request }) => {
  const title = `Shared E2E Recipe ${Date.now()}`;

  const configResponse = await request.get(`${API}/app/config/`);
  expect(configResponse.ok()).toBeTruthy();
  expect(await configResponse.json()).toMatchObject({
    mode: "single_user",
    authenticationRequired: false,
  });

  const recipeResponse = await request.post(`${API}/recipes/`, {
    data: {
      title,
      servings: 2,
      ingredients: [{ item: "tomato" }],
      steps: [{ order: 1, text: "Simmer the tomato" }],
      tags: ["E2E"],
    },
  });
  expect(recipeResponse.status()).toBe(201);
  const recipe = await recipeResponse.json();

  await expect((await request.post(`${API}/recipes/${recipe.id}/favorite/`)).ok()).toBeTruthy();
  await expect(
    (await request.post(`${API}/recipes/${recipe.id}/rate/`, { data: { stars: 4 } })).ok(),
  ).toBeTruthy();
  await expect(
    (await request.post(`${API}/comments/`, {
      data: { recipe: recipe.id, text: "Shared kitchen note" },
    })).ok(),
  ).toBeTruthy();

  const collectionResponse = await request.post(`${API}/collections/`, {
    data: { name: `E2E Collection ${Date.now()}`, recipeIds: [] },
  });
  const collection = await collectionResponse.json();
  await expect(
    (await request.post(`${API}/collections/${collection.id}/recipes/${recipe.id}/`)).ok(),
  ).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Login" })).toHaveCount(0);
  await expect(page.getByText(title)).toBeVisible();
  await page.getByText(title).click();
  await expect(page.getByRole("heading", { name: /Notes/ })).toBeVisible();
  await expect(page.getByText("Shared kitchen note")).toBeVisible();

  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText("Shared kitchen note")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText("Single-user (shared owner)")).toBeVisible();
  await expect(page.getByText(/Everyone who can reach this instance/)).toBeVisible();

  await expect((await request.delete(`${API}/recipes/${recipe.id}/`)).status()).toBe(204);
  await expect((await request.delete(`${API}/collections/${collection.id}/`)).status()).toBe(204);
});
