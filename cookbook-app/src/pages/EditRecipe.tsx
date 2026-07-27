// Recipe editing page for updating existing recipes and their linked suggestions.

import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, X, Upload, Salad, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useRecipes } from "@/hooks/useRecipes";
import { Ingredient, Step } from "@/types/recipe";
import { toast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api";
import SortableStepList from "@/components/SortableStepList";
import SearchableRecipeSelect from "@/components/SearchableRecipeSelect";

export default function EditRecipe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipes, updateRecipe, refreshRecipe, ensureAllRecipesLoaded } = useRecipes();

  const recipe = recipes.find((r) => r.id === id);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState(4);
  const [prepMin, setPrepMin] = useState<number>();
  const [cookMin, setCookMin] = useState<number>();
  const [imageUrl, setImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ item: "" }]);
  const [steps, setSteps] = useState<Step[]>([{ order: 1, text: "" }]);
  const [isSide, setIsSide] = useState(false);
  const [isSauce, setIsSauce] = useState(false);
  const [suggestedSideIds, setSuggestedSideIds] = useState<string[]>([]);
  const [suggestedSauceIds, setSuggestedSauceIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sideRecipes = recipes.filter((r) => r.isSide && r.id !== id);
  const sauceRecipes = recipes.filter((r) => r.isSauce && r.id !== id);

  useEffect(() => {
    ensureAllRecipesLoaded().catch(() => undefined);
  }, [ensureAllRecipesLoaded]);

  useEffect(() => {
    if (id && !recipe) {
      refreshRecipe(id).catch(() => undefined);
    }
  }, [id, recipe, refreshRecipe]);

  useEffect(() => {
    if (recipe) {
      setTitle(recipe.title);
      setDescription(recipe.description || "");
      setServings(recipe.servings);
      setPrepMin(recipe.prepMin);
      setCookMin(recipe.cookMin);
      setImageUrl(recipe.imageUrl || "");
      setSourceUrl(recipe.sourceUrl || "");
      setTags(recipe.tags);
      setIngredients(recipe.ingredients.length > 0 ? recipe.ingredients : [{ item: "" }]);
      setSteps(recipe.steps.length > 0 ? recipe.steps : [{ order: 1, text: "" }]);
      setIsSide(recipe.isSide || false);
      setIsSauce(recipe.isSauce || false);
      setSuggestedSideIds(recipe.suggestedSideIds || []);
      setSuggestedSauceIds(recipe.suggestedSauceIds || []);
    }
  }, [recipe]);

  if (!recipe) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Recipe not found</p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be less than 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => setImageUrl(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const addIngredient = () => setIngredients([...ingredients, { item: "" }]);

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    setIngredients(newIngredients);
  };

  const removeIngredient = (index: number) => setIngredients(ingredients.filter((_, i) => i !== index));

  const addStep = () => setSteps([...steps, { order: steps.length + 1, text: "" }]);

  const isAccompaniment = isSide || isSauce;

  const toggleSideId = (id: string) => {
    setSuggestedSideIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSauceId = (id: string) => {
    setSuggestedSauceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const filteredIngredients = ingredients.filter((i) => i.item.trim());
    const filteredSteps = steps.filter((s) => s.text.trim());
    if (filteredIngredients.length === 0 || filteredSteps.length === 0) {
      toast({ title: "Add at least one ingredient and step", variant: "destructive" });
      return;
    }
    try {
      await updateRecipe(id!, {
        version: recipe.version,
        title,
        description,
        servings,
        prepMin,
        cookMin,
        tags,
        imageUrl,
        sourceUrl,
        ingredients: filteredIngredients,
        steps: filteredSteps,
        isSide,
        isSauce,
        suggestedSideIds: isAccompaniment ? [] : suggestedSideIds,
        suggestedSauceIds: isAccompaniment ? [] : suggestedSauceIds,
      });
    } catch (error) {
      toast({
        title: "Failed to update recipe",
        description: getApiErrorMessage(error, "The recipe could not be updated."),
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Recipe updated!" });
    navigate("/");
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="border-b bg-card sticky top-0 z-40 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold">Edit Recipe</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recipe title" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" rows={3} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="servings">Servings</Label>
            <Input id="servings" type="number" value={servings} onChange={(e) => setServings(Number(e.target.value))} min={1} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prepMin">Prep (min)</Label>
            <Input id="prepMin" type="number" value={prepMin || ""} onChange={(e) => setPrepMin(e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cookMin">Cook (min)</Label>
            <Input id="cookMin" type="number" value={cookMin || ""} onChange={(e) => setCookMin(e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Recipe Image</Label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Image
              </Button>
              <span className="text-sm text-muted-foreground">or</span>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste image URL" className="flex-1" />
            </div>
            {imageUrl && (
              <div className="relative inline-block">
                <img src={imageUrl} alt="Preview" className="h-32 w-32 object-cover rounded border" />
                <Button type="button" variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => setImageUrl("")}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceUrl">Source URL</Label>
          <Input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Original recipe link"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <div className="flex gap-2">
            <Input id="tags" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add tag and press Enter" />
            <Button type="button" onClick={addTag}>Add</Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => removeTag(tag)} />
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Ingredients *</Label>
            <Button type="button" size="sm" onClick={addIngredient}><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
          {ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Qty" value={ing.qty || ""} onChange={(e) => updateIngredient(i, "qty", e.target.value)} className="w-20" />
              <Input placeholder="Unit" value={ing.unit || ""} onChange={(e) => updateIngredient(i, "unit", e.target.value)} className="w-24" />
              <Input placeholder="Item *" value={ing.item} onChange={(e) => updateIngredient(i, "item", e.target.value)} className="flex-1" />
              {ingredients.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => removeIngredient(i)}><X className="w-4 h-4" /></Button>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Steps *</Label>
            <Button type="button" size="sm" onClick={addStep}><Plus className="w-4 h-4 mr-1" />Add</Button>
          </div>
          <SortableStepList steps={steps} setSteps={setSteps} ingredients={ingredients} idPrefix="edit-" />
        </div>

        {/* Category Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><Salad className="w-4 h-4" />This is a side dish</Label>
              <p className="text-xs text-muted-foreground">Side dishes can be paired with main courses</p>
            </div>
            <Switch checked={isSide} onCheckedChange={(v) => { setIsSide(v); if (v) setIsSauce(false); }} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><Droplets className="w-4 h-4" />This is a sauce / condiment</Label>
              <p className="text-xs text-muted-foreground">Sauces and condiments can be paired with main courses</p>
            </div>
            <Switch checked={isSauce} onCheckedChange={(v) => { setIsSauce(v); if (v) setIsSide(false); }} />
          </div>
        </div>

        {/* Suggested Sides & Sauces (only for non-accompaniment recipes) */}
        {!isAccompaniment && sideRecipes.length > 0 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Salad className="w-4 h-4" />Suggested Sides</Label>
            <p className="text-xs text-muted-foreground">Choose side dishes to recommend with this recipe</p>
            <SearchableRecipeSelect
              label="Select sides…"
              icon={<Salad className="w-4 h-4" />}
              recipes={sideRecipes}
              selectedIds={suggestedSideIds}
              onToggle={toggleSideId}
              placeholder="Search sides…"
            />
          </div>
        )}

        {!isAccompaniment && sauceRecipes.length > 0 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Droplets className="w-4 h-4" />Suggested Sauces & Condiments</Label>
            <p className="text-xs text-muted-foreground">Choose sauces to recommend with this recipe</p>
            <SearchableRecipeSelect
              label="Select sauces…"
              icon={<Droplets className="w-4 h-4" />}
              recipes={sauceRecipes}
              selectedIds={suggestedSauceIds}
              onToggle={toggleSauceId}
              placeholder="Search sauces…"
            />
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 border-t bg-card p-4">
          <div className="max-w-5xl mx-auto flex gap-3 justify-end">
            <Button variant="outline" onClick={() => navigate("/")}>Cancel</Button>
            <Button onClick={handleSubmit}>Update Recipe</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
