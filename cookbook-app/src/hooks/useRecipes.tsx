// Recipe data context that keeps the list view, pagination, and CRUD helpers in sync.

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Recipe } from "@/types/recipe";
import { apiRequest } from "@/lib/api";

const DEFAULT_RECIPES_PAGE_SIZE = 25;

type RecipesContextType = {
  recipes: Recipe[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMoreRecipes: boolean;
  totalRecipes: number;
  addRecipe: (recipe: Omit<Recipe, "id">) => Promise<Recipe>;
  updateRecipe: (id: string, recipe: Omit<Recipe, "id">) => Promise<Recipe>;
  deleteRecipe: (id: string) => Promise<boolean>;
  exportRecipes: () => void;
  importRecipes: (data: Recipe[]) => Promise<void>;
  refreshRecipes: () => Promise<void>;
  refreshRecipe: (id: string) => Promise<void>;
  loadMoreRecipes: () => Promise<void>;
  ensureAllRecipesLoaded: () => Promise<void>;
};

const RecipesContext = createContext<RecipesContextType | undefined>(undefined);

type RecipesPageResponse = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: Recipe[];
} | Recipe[];

function normalizeRecipe(recipe: Recipe): Recipe {
  return {
    ...recipe,
    id: String(recipe.id),
    suggestedSideIds: (recipe.suggestedSideIds || []).map((id) => String(id)),
    suggestedSauceIds: (recipe.suggestedSauceIds || []).map((id) => String(id)),
    ratings: (recipe.ratings || []).map((rating) => ({
      ...rating,
      recipeId: String(rating.recipeId),
      userId: String(rating.userId),
    })),
    comments: (recipe.comments || []).map((comment) => ({
      ...comment,
      id: String(comment.id),
      recipeId: String(comment.recipeId),
      userId: String(comment.userId),
    })),
  };
}

function normalizeRecipes(payload: RecipesPageResponse): Recipe[] {
  const recipes = Array.isArray(payload) ? payload : payload.results || [];
  return recipes.map(normalizeRecipe);
}

function getRecipeCount(payload: RecipesPageResponse): number {
  if (Array.isArray(payload)) return payload.length;
  return payload.count || 0;
}

function getNextRecipesPath(nextUrl: string | null | undefined): string | null {
  if (!nextUrl) return null;

  try {
    const url = new URL(nextUrl, window.location.origin);
    const apiIndex = url.pathname.indexOf("/api/");
    const path = apiIndex >= 0 ? url.pathname.slice(apiIndex + 4) : url.pathname;
    return `${path}${url.search}`;
  } catch {
    return null;
  }
}

export function RecipesProvider({ children }: { children: ReactNode }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>("/recipes/");
  const [totalRecipes, setTotalRecipes] = useState(0);

  const mergeRecipes = useCallback((incoming: Recipe[], replace = false) => {
    setRecipes((prev) => {
      if (replace) {
        return incoming;
      }

      const merged = new Map(prev.map((recipe) => [recipe.id, recipe]));
      incoming.forEach((recipe) => {
        merged.set(recipe.id, recipe);
      });
      return Array.from(merged.values());
    });
  }, []);

  const fetchRecipePage = useCallback(async (path: string) => {
    const payload = await apiRequest<RecipesPageResponse>(path);
    const normalized = normalizeRecipes(payload);
    return {
      recipes: normalized,
      next: Array.isArray(payload) ? null : getNextRecipesPath(payload.next),
      count: getRecipeCount(payload),
    };
  }, []);

  const refreshRecipes = useCallback(async () => {
    setIsLoading(true);
    try {
      const targetCount = Math.max(recipes.length, DEFAULT_RECIPES_PAGE_SIZE);
      let currentPath: string | null = "/recipes/";
      let loaded: Recipe[] = [];
      let count = 0;

      while (currentPath && loaded.length < targetCount) {
        const page = await fetchRecipePage(currentPath);
        loaded = [...loaded, ...page.recipes];
        currentPath = page.next;
        count = page.count;
      }

      mergeRecipes(loaded, true);
      setNextPath(currentPath);
      setTotalRecipes(count);
    } finally {
      setIsLoading(false);
    }
  }, [fetchRecipePage, mergeRecipes, recipes.length]);

  const refreshRecipe = useCallback(async (id: string) => {
    const recipe = normalizeRecipe(await apiRequest<Recipe>(`/recipes/${id}/`));
    const exists = recipes.some((entry) => entry.id === id);
    setRecipes((prev) => {
      if (!exists) {
        return [recipe, ...prev];
      }
      return prev.map((entry) => (entry.id === id ? recipe : entry));
    });
    if (!exists) {
      setTotalRecipes((prev) => prev + 1);
    }
  }, [recipes]);

  const loadMoreRecipes = useCallback(async () => {
    if (!nextPath || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const page = await fetchRecipePage(nextPath);
      mergeRecipes(page.recipes);
      setNextPath(page.next);
      setTotalRecipes(page.count);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchRecipePage, isLoadingMore, mergeRecipes, nextPath]);

  const ensureAllRecipesLoaded = useCallback(async () => {
    if (!nextPath || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      let currentPath: string | null = nextPath;
      const loaded: Recipe[] = [];
      let count = totalRecipes;

      while (currentPath) {
        const page = await fetchRecipePage(currentPath);
        loaded.push(...page.recipes);
        currentPath = page.next;
        count = page.count;
      }

      mergeRecipes(loaded);
      setNextPath(null);
      setTotalRecipes(count);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchRecipePage, isLoadingMore, mergeRecipes, nextPath, totalRecipes]);

  useEffect(() => {
    refreshRecipes().catch(() => {
      setRecipes([]);
      setNextPath(null);
      setTotalRecipes(0);
      setIsLoading(false);
    });
  }, []);

  const addRecipe = async (recipe: Omit<Recipe, "id">) => {
    const created = normalizeRecipe(
      await apiRequest<Recipe>("/recipes/", {
        method: "POST",
        body: JSON.stringify(recipe),
      }),
    );
    setRecipes((prev) => [created, ...prev]);
    setTotalRecipes((prev) => prev + 1);
    return created;
  };

  const updateRecipe = async (id: string, recipe: Omit<Recipe, "id">) => {
    const updated = normalizeRecipe(
      await apiRequest<Recipe>(`/recipes/${id}/`, {
        method: "PUT",
        body: JSON.stringify(recipe),
      }),
    );
    setRecipes((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
    return updated;
  };

  const deleteRecipe = async (id: string) => {
    await apiRequest(`/recipes/${id}/`, { method: "DELETE" });
    setRecipes((prev) => prev.filter((entry) => entry.id !== id));
    setTotalRecipes((prev) => Math.max(0, prev - 1));
    return true;
  };

  const exportRecipes = () => {
    const dataStr = JSON.stringify(recipes, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `emma-cookbook-recipes-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importRecipes = async (data: Recipe[]) => {
    for (const recipe of data) {
      const { id: _id, ...payload } = recipe;
      await addRecipe(payload);
    }
  };

  return (
    <RecipesContext.Provider
      value={{
        recipes,
        isLoading,
        isLoadingMore,
        hasMoreRecipes: nextPath !== null,
        totalRecipes,
        addRecipe,
        updateRecipe,
        deleteRecipe,
        exportRecipes,
        importRecipes,
        refreshRecipes,
        refreshRecipe,
        loadMoreRecipes,
        ensureAllRecipesLoaded,
      }}
    >
      {children}
    </RecipesContext.Provider>
  );
}

export function useRecipes() {
  const context = useContext(RecipesContext);
  if (!context) throw new Error("useRecipes must be used within RecipesProvider");
  return context;
}
