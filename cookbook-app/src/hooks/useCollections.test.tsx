import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionsProvider, useCollections } from "./useCollections";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));
const apiMock = vi.mocked(apiRequest);
const wrapper = ({ children }: { children: ReactNode }) => (
  <CollectionsProvider>{children}</CollectionsProvider>
);

describe("CollectionsProvider", () => {
  beforeEach(() => apiMock.mockReset());

  it("loads and manages normalized collections", async () => {
    apiMock.mockResolvedValueOnce([{ id: 1, name: "Dinner", recipeIds: [2] }]);
    const { result } = renderHook(() => useCollections(), { wrapper });
    await waitFor(() => expect(result.current.collections).toEqual([
      { id: "1", name: "Dinner", recipeIds: ["2"] },
    ]));

    expect(result.current.isInCollection("1", "2")).toBe(true);
    expect(result.current.getCollectionsForRecipe("2")).toHaveLength(1);

    apiMock.mockResolvedValueOnce({ id: 3, name: "Lunch", recipeIds: [] });
    act(() => result.current.createCollection("Lunch"));
    await waitFor(() => expect(result.current.collections).toHaveLength(2));

    apiMock.mockResolvedValueOnce({ id: 1, name: "Favorites", recipeIds: [2] });
    act(() => result.current.renameCollection("1", "Favorites"));
    await waitFor(() => expect(result.current.collections[0].name).toBe("Favorites"));

    apiMock.mockResolvedValueOnce({ id: 1, name: "Favorites", recipeIds: [2, 4] });
    act(() => result.current.addToCollection("1", "4"));
    await waitFor(() => expect(result.current.isInCollection("1", "4")).toBe(true));

    apiMock.mockResolvedValueOnce({ id: 1, name: "Favorites", recipeIds: [4] });
    act(() => result.current.removeFromCollection("1", "2"));
    await waitFor(() => expect(result.current.isInCollection("1", "2")).toBe(false));

    apiMock.mockResolvedValueOnce(undefined);
    act(() => result.current.deleteCollection("3"));
    await waitFor(() => expect(result.current.collections).toHaveLength(1));
  });

  it("falls back to an empty list when loading fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useCollections(), { wrapper });
    await waitFor(() => expect(result.current.collections).toEqual([]));
  });

  it("requires its provider", () => {
    expect(() => renderHook(() => useCollections())).toThrow(
      "useCollections must be used within CollectionsProvider",
    );
  });
});
