export interface Recipe {
  id: number;
  title: string;
  description: string;
  instructions: string;
  created_by: string;
  created_at: string;
  image?: string;

  tags: string[];
  ingredients: RecipeIngredient[];

  servings: number;
  prep_time: string;
  cook_time: string;
  total_time: string;
}

export interface RecipeIngredient {
  ingredient: Ingredient;
  amount: string;
}

export interface Ingredient {
  id: number;
  name: string;
}

export interface Tag {
  id: number,
  name: string;
}

export interface Comment {
  author: string;
  created_at: string;
  text: String;
}

// For communication with backend
export interface RecipeFormInput {
  title: string;
  description: string;
  instructions: string;
  tags?: string[];
  ingredients_data: { ingredient_id: number; amount: string }[];
  image?: File | null;
}