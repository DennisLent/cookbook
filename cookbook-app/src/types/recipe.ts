import { Comment, Rating } from "@/types/social";

export type Ingredient = {
  qty?: string;
  unit?: string;
  item: string;
  note?: string;
};

export type Step = {
  order: number;
  text: string;
  timerSec?: number;
  imageUrl?: string;
  /** Manually linked ingredient indices (overrides auto-match) */
  ingredientIndices?: number[];
};

export type Recipe = {
  id: string;
  /** Server revision used to reject stale whole-recipe updates. */
  version?: number;
  title: string;
  description?: string;
  created_by?: string;
  origin?: string;
  servings: number;
  prepMin?: number;
  cookMin?: number;
  tags: string[];
  imageUrl?: string;
  sourceUrl?: string;
  videoUrl?: string;
  ingredients: Ingredient[];
  steps: Step[];
  /** Mark this recipe as a side dish */
  isSide?: boolean;
  /** Mark this recipe as a sauce or condiment */
  isSauce?: boolean;
  /** IDs of side-dish recipes suggested alongside this main dish */
  suggestedSideIds?: string[];
  /** IDs of sauce/condiment recipes suggested alongside this main dish */
  suggestedSauceIds?: string[];
  ratings?: Rating[];
  comments?: Comment[];
  my_rating?: number;
  avg_rating?: number;
  is_favorited?: boolean;
};
