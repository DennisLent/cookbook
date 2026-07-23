// Recipe creation page, including manual entry and assisted import flows.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, History, Loader2, Plus, RotateCcw, X, Upload, Link, ExternalLink, Salad, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useRecipes } from "@/hooks/useRecipes";
import { Ingredient, Step, Recipe } from "@/types/recipe";
import { toast } from "@/hooks/use-toast";
import { apiRequest, getApiErrorMessage } from "@/lib/api";
import SortableStepList from "@/components/SortableStepList";
import SearchableRecipeSelect from "@/components/SearchableRecipeSelect";

type RecipeImportJobResult = {
  title?: string;
  description?: string;
  instructions?: string;
  ingredients_data?: Array<{
    ingredient?: string;
    amount?: string;
  }>;
};

type RecipeImportJob = {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  progressStage: "queued" | "downloading" | "parsing" | "verifying" | "done" | "failed";
  platform: "instagram" | "tiktok" | "youtube";
  sourceUrl: string;
  videoOnly?: boolean;
  saveVideo?: boolean;
  mediaUrl?: string | null;
  errorCode?: string;
  errorMessage?: string;
  result?: RecipeImportJobResult;
};

type RecipeImportRequest = {
  url: string;
  videoOnly: boolean;
  saveVideo: boolean;
};

const IMPORT_PROGRESS_STEPS = [
  { key: "downloading", label: "Downloading" },
  { key: "parsing", label: "Parsing" },
  { key: "verifying", label: "Verifying" },
  { key: "done", label: "Done" },
] as const;

type ImportProgressStepKey = (typeof IMPORT_PROGRESS_STEPS)[number]["key"];

function getImportProgressValue(stage: RecipeImportJob["progressStage"]) {
  switch (stage) {
    case "queued":
      return 8;
    case "downloading":
      return 30;
    case "parsing":
      return 58;
    case "verifying":
      return 82;
    case "done":
      return 100;
    case "failed":
      return 0;
    default:
      return 0;
  }
}

function getImportStageDescription(job: RecipeImportJob) {
  if (job.status === "failed") {
    return job.errorMessage || "The importer could not process this video.";
  }

  if (job.videoOnly) {
    switch (job.progressStage) {
      case "queued":
        return "Your video download is queued and waiting for the worker to pick it up.";
      case "downloading":
        return "We are fetching the source video so it can be attached to this recipe.";
      case "done":
        return "The video has been attached. Fill in the rest of the recipe manually before saving.";
      case "failed":
        return job.errorMessage || "The importer could not process this video.";
      default:
        return "Video download in progress.";
    }
  }

  switch (job.progressStage) {
    case "queued":
      return "Your import is queued and waiting for the worker to pick it up.";
    case "downloading":
      return "We are fetching the source video and preparing it for transcription.";
    case "parsing":
      return "We are extracting audio, transcribing the content, and turning it into recipe data.";
    case "verifying":
      return "We are validating the parsed recipe before filling in the form.";
    case "done":
      return "Imported fields have been filled in below. Review them before saving.";
    case "failed":
      return job.errorMessage || "The importer could not process this video.";
    default:
      return "Import in progress.";
  }
}

function formatImportStageLabel(job: RecipeImportJob) {
  const label = job.progressStage.charAt(0).toUpperCase() + job.progressStage.slice(1);
  return job.status === "failed" ? `${label} failed` : label;
}

function getImportStepState(step: ImportProgressStepKey, stage: RecipeImportJob["progressStage"]) {
  const stepOrder: ImportProgressStepKey[] = ["downloading", "parsing", "verifying", "done"];
  const normalizedStage = stage === "queued" || stage === "failed" ? "downloading" : stage;
  const currentIndex = stepOrder.indexOf(normalizedStage as ImportProgressStepKey);
  const stepIndex = stepOrder.indexOf(step);

  if (stage === "queued") {
    return step === "downloading" ? "current" : "pending";
  }

  if (stepIndex < currentIndex) {
    return "complete";
  }

  if (stepIndex === currentIndex) {
    return "current";
  }

  return "pending";
}

function splitImportedInstructions(raw: string | undefined) {
  if (!raw) return [{ order: 1, text: "" }];

  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [{ order: 1, text: "" }];
  }

  return lines.map((text, index) => ({
    order: index + 1,
    text,
  }));
}

function isLikelySourceUrl(value: string | undefined, sourceUrl: string) {
  if (!value) return false;
  const normalized = value.trim();
  return normalized === sourceUrl || /^https?:\/\//i.test(normalized);
}

function deriveOrigin(sourceUrl: string, activeTab: string) {
  if (activeTab !== "link") {
    return "manual";
  }

  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
    if (hostname.includes("instagram.com")) return "instagram";
    if (hostname.includes("tiktok.com")) return "tiktok";
  } catch {
    // Fall back to website for malformed or partial URLs.
  }

  return sourceUrl.trim() ? "website" : "manual";
}

export default function AddRecipe() {
  const navigate = useNavigate();
  const { recipes, addRecipe, ensureAllRecipesLoaded } = useRecipes();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState(4);
  const [prepMin, setPrepMin] = useState<number>();
  const [cookMin, setCookMin] = useState<number>();
  const [imageUrl, setImageUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ item: "" }]);
  const [steps, setSteps] = useState<Step[]>([{ order: 1, text: "" }]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isSide, setIsSide] = useState(false);
  const [isSauce, setIsSauce] = useState(false);
  const [suggestedSideIds, setSuggestedSideIds] = useState<string[]>([]);
  const [suggestedSauceIds, setSuggestedSauceIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("manual");
  const [importJob, setImportJob] = useState<RecipeImportJob | null>(null);
  const [recentImportJobs, setRecentImportJobs] = useState<RecipeImportJob[]>([]);
  const [isLoadingImportHistory, setIsLoadingImportHistory] = useState(false);
  const [isStartingImport, setIsStartingImport] = useState(false);
  const [isSavingVideoOnly, setIsSavingVideoOnly] = useState(false);
  const [retryingImportJobId, setRetryingImportJobId] = useState<number | null>(null);
  const [saveVideo, setSaveVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureAllRecipesLoaded().catch(() => undefined);
  }, [ensureAllRecipesLoaded]);

  const sideRecipes = recipes.filter((r) => r.isSide);
  const sauceRecipes = recipes.filter((r) => r.isSauce);
  const isAccompaniment = isSide || isSauce;

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { item: "" }]);
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    setIngredients(newIngredients);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const addStep = () => {
    setSteps([...steps, { order: steps.length + 1, text: "" }]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be less than 5MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const getVideoEmbed = (url: string) => {
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    if (ytMatch) {
      return { type: "youtube", id: ytMatch[1] };
    }
    // Instagram
    if (url.includes("instagram.com")) {
      return { type: "instagram", url };
    }
    // TikTok
    if (url.includes("tiktok.com")) {
      return { type: "tiktok", url };
    }
    return null;
  };

  const applyImportedRecipe = (job: RecipeImportJob) => {
    setSourceUrl(job.sourceUrl);
    setVideoUrl(job.mediaUrl || "");

    if (job.videoOnly) {
      setSteps((current) => {
        const filtered = current.filter((step) => step.text.trim());
        return filtered.length > 0 ? filtered : [];
      });
      return;
    }

    const result = job.result;
    if (!result) return;

    if (result.title?.trim()) {
      setTitle(result.title.trim());
    }

    if (result.description?.trim() && !isLikelySourceUrl(result.description, job.sourceUrl)) {
      setDescription(result.description.trim());
    }

    const importedIngredients = (result.ingredients_data || [])
      .map((entry) => ({
        qty: entry.amount?.trim() || "",
        item: entry.ingredient?.trim() || "",
      }))
      .filter((entry) => entry.item);

    if (importedIngredients.length > 0) {
      setIngredients(importedIngredients);
    }

    setSteps(splitImportedInstructions(result.instructions));
  };

  const upsertRecentImportJob = (job: RecipeImportJob) => {
    setRecentImportJobs((current) => {
      const next = [job, ...current.filter((entry) => entry.id !== job.id)];
      return next.slice(0, 10);
    });
  };

  const loadImportHistory = async () => {
    setIsLoadingImportHistory(true);
    try {
      const jobs = await apiRequest<RecipeImportJob[]>("/recipe-import-jobs/");
      setRecentImportJobs(jobs);
    } catch {
      setRecentImportJobs([]);
    } finally {
      setIsLoadingImportHistory(false);
    }
  };

  const startImportFromRequest = async (
    request: RecipeImportRequest,
    options?: {
      startedTitle?: string;
      startedDescription?: string;
      failureTitle?: string;
      done?: () => void;
    },
  ) => {
    const normalizedUrl = request.url.trim();
    if (!normalizedUrl) {
      toast({ title: "Paste a YouTube, Instagram, or TikTok URL first", variant: "destructive" });
      return;
    }

    if (request.videoOnly) {
      setIsSavingVideoOnly(true);
    } else {
      setIsStartingImport(true);
    }
    try {
      const job = await apiRequest<RecipeImportJob>("/recipe-import-jobs/", {
        method: "POST",
        body: JSON.stringify(request),
      });
      setSourceUrl(normalizedUrl);
      setImportJob(job);
      upsertRecentImportJob(job);
      toast({
        title: options?.startedTitle || (request.videoOnly ? "Video download started" : "Import started"),
        description: options?.startedDescription || (request.videoOnly
          ? "We are downloading the source video so you can save it with the recipe."
          : "We are downloading and transcribing the video now."),
      });
      options?.done?.();
    } catch (error) {
      toast({
        title: options?.failureTitle || "Failed to start import",
        description: getApiErrorMessage(error, "The video import job could not be created."),
        variant: "destructive",
      });
    } finally {
      setIsStartingImport(false);
      setIsSavingVideoOnly(false);
    }
  };

  const startImportFromLink = async (videoOnly = false) => {
    await startImportFromRequest({
      url: sourceUrl,
      videoOnly,
      saveVideo: videoOnly || saveVideo,
    });
  };

  const handleRetryImportJob = async (job: RecipeImportJob) => {
    setRetryingImportJobId(job.id);
    try {
      await startImportFromRequest(
        {
          url: job.sourceUrl,
          videoOnly: Boolean(job.videoOnly),
          saveVideo: Boolean(job.saveVideo),
        },
        {
          startedTitle: job.videoOnly ? "Video download retried" : "Import retried",
          startedDescription: job.videoOnly
            ? "We are retrying the saved-video download with the original settings."
            : "We are retrying the import with the original settings.",
          failureTitle: "Failed to retry import",
        },
      );
    } finally {
      setRetryingImportJobId(null);
    }
  };

  const handleLoadImportJob = (job: RecipeImportJob) => {
    setActiveTab("link");
    setImportJob(job);
    setSourceUrl(job.sourceUrl);
    setSaveVideo(Boolean(job.saveVideo));

    if (job.status === "done") {
      applyImportedRecipe(job);
      toast({
        title: job.videoOnly ? "Saved video restored" : "Imported recipe restored",
        description: job.videoOnly
          ? "The saved video has been loaded back into this draft."
          : "The imported fields have been loaded back into this draft.",
      });
    }
  };

  useEffect(() => {
    if (activeTab !== "link") return;
    void loadImportHistory();
  }, [activeTab]);

  useEffect(() => {
    if (!importJob || importJob.status === "done" || importJob.status === "failed") {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const nextJob = await apiRequest<RecipeImportJob>(`/recipe-import-jobs/${importJob.id}/`);
        setImportJob(nextJob);
        upsertRecentImportJob(nextJob);

        if (nextJob.status === "done") {
          applyImportedRecipe(nextJob);
          window.clearInterval(interval);
          void loadImportHistory();
          toast({
            title: nextJob.videoOnly ? "Video saved to the draft" : "Recipe imported",
            description: nextJob.videoOnly
              ? "Fill in the recipe details manually and save when you are ready."
              : "You can review and edit the imported recipe before saving.",
          });
        } else if (nextJob.status === "failed") {
          window.clearInterval(interval);
          void loadImportHistory();
          toast({
            title: "Import failed",
            description: nextJob.errorMessage || "The importer could not process this public video URL.",
            variant: "destructive",
          });
        }
      } catch (error) {
        window.clearInterval(interval);
        toast({
          title: "Import status check failed",
          description: getApiErrorMessage(error, "The import job status could not be refreshed."),
          variant: "destructive",
        });
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [importJob]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    const filteredIngredients = ingredients.filter((i) => i.item.trim());
    const filteredSteps = steps.filter((s) => s.text.trim());
    const hasSavedVideo = Boolean(videoUrl.trim());

    if (filteredIngredients.length === 0) {
      toast({ title: "Add at least one ingredient", variant: "destructive" });
      return;
    }

    if (filteredSteps.length === 0 && !hasSavedVideo) {
      toast({ title: "Add at least one step or save a video first", variant: "destructive" });
      return;
    }

    try {
      await addRecipe({
        title,
        description,
        origin: deriveOrigin(sourceUrl, activeTab),
        servings,
        prepMin,
        cookMin,
        tags,
        imageUrl,
        sourceUrl,
        videoUrl,
        ingredients: filteredIngredients,
        steps: filteredSteps,
        isSide,
        isSauce,
        suggestedSideIds: isAccompaniment ? [] : suggestedSideIds,
        suggestedSauceIds: isAccompaniment ? [] : suggestedSauceIds,
      });
    } catch (error) {
      toast({
        title: "Failed to save recipe",
        description: getApiErrorMessage(error, "The recipe could not be saved."),
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Recipe saved!" });
    navigate("/");
  };

  const videoEmbed = sourceUrl ? getVideoEmbed(sourceUrl) : null;
  const importIsActive = importJob?.status === "queued" || importJob?.status === "running";
  const canImportFromLink = Boolean(
    videoEmbed?.type === "instagram" || videoEmbed?.type === "tiktok" || videoEmbed?.type === "youtube"
  );
  const recentImportHistory = recentImportJobs.slice(0, 5);

  const renderRecipeForm = (idPrefix = "") => (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}title`}>
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`${idPrefix}title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Grandma's Chocolate Chip Cookies"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}description`}>Description</Label>
        <Textarea
          id={`${idPrefix}description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief description of this recipe"
          rows={2}
        />
      </div>

      {/* Times and Servings */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}servings`}>Servings</Label>
          <Input
            id={`${idPrefix}servings`}
            type="number"
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}prepMin`}>Prep (min)</Label>
          <Input
            id={`${idPrefix}prepMin`}
            type="number"
            value={prepMin || ""}
            onChange={(e) => setPrepMin(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="—"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}cookMin`}>Cook (min)</Label>
          <Input
            id={`${idPrefix}cookMin`}
            type="number"
            value={cookMin || ""}
            onChange={(e) => setCookMin(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="—"
          />
        </div>
      </div>

      {/* Image */}
      <div className="space-y-2">
        <Label>Image</Label>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
            <span className="text-sm text-muted-foreground">or</span>
            <Input
              value={imageUrl.startsWith("data:") ? "" : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Paste image URL"
              className="flex-1"
            />
          </div>
          {imageUrl && (
            <div className="relative inline-block">
              <img
                src={imageUrl}
                alt="Preview"
                className="h-24 w-36 object-cover rounded-md border"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={() => setImageUrl("")}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}tags`}>Tags</Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}tags`}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add tag and press Enter"
          />
          <Button type="button" variant="secondary" onClick={addTag}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Ingredients */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            Ingredients <span className="text-destructive">*</span>
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {ingredients.map((ing, i) => (
            <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2">
              <div className="flex gap-2 w-full sm:w-auto">
                <Input
                  placeholder="Qty"
                  value={ing.qty || ""}
                  onChange={(e) => updateIngredient(i, "qty", e.target.value)}
                  className="w-[4.5rem]"
                />
                <Input
                  placeholder="Unit"
                  value={ing.unit || ""}
                  onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                  className="w-[5rem]"
                />
                <Input
                  placeholder="Ingredient"
                  value={ing.item}
                  onChange={(e) => updateIngredient(i, "item", e.target.value)}
                  className="flex-1 min-w-0"
                />
              </div>
              {ingredients.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeIngredient(i)}
                  className="shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            Steps <span className="text-destructive">*</span>
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
        <SortableStepList steps={steps} setSteps={setSteps} ingredients={ingredients} idPrefix={idPrefix} />
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

      {/* Suggested Sides */}
      {!isAccompaniment && sideRecipes.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Salad className="w-4 h-4" />Suggested Sides</Label>
          <p className="text-xs text-muted-foreground">Choose side dishes to recommend with this recipe</p>
          <SearchableRecipeSelect
            label="Select sides…"
            icon={<Salad className="w-4 h-4" />}
            recipes={sideRecipes}
            selectedIds={suggestedSideIds}
            onToggle={(id) => setSuggestedSideIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
            placeholder="Search sides…"
          />
        </div>
      )}

      {/* Suggested Sauces */}
      {!isAccompaniment && sauceRecipes.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Droplets className="w-4 h-4" />Suggested Sauces & Condiments</Label>
          <p className="text-xs text-muted-foreground">Choose sauces to recommend with this recipe</p>
          <SearchableRecipeSelect
            label="Select sauces…"
            icon={<Droplets className="w-4 h-4" />}
            recipes={sauceRecipes}
            selectedIds={suggestedSauceIds}
            onToggle={(id) => setSuggestedSauceIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
            placeholder="Search sauces…"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold">Add Recipe</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="link">From Link</TabsTrigger>
          </TabsList>

          {/* Manual Entry Tab */}
          <TabsContent value="manual">
            {renderRecipeForm("manual-")}
          </TabsContent>

          {/* From Link Tab */}
          <TabsContent value="link" className="space-y-6">
            {/* URL Input */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sourceUrl" className="flex items-center gap-2">
                    <Link className="w-4 h-4" />
                    Recipe Link
                  </Label>
                  <Input
                    id="sourceUrl"
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => {
                      setSourceUrl(e.target.value);
                      setImportJob(null);
                    }}
                    placeholder="Paste YouTube, Instagram, TikTok, or website URL"
                  />
                  <p className="text-sm text-muted-foreground">
                    Paste a public YouTube, Instagram, or TikTok URL to import ingredients and steps automatically. You can also keep the source video with the recipe, or save the video alone and fill everything else in manually.
                  </p>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
                  <div className="space-y-1">
                    <Label htmlFor="saveVideo" className="text-sm font-medium">
                      Save video
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Keep the downloaded video on the recipe after import finishes.
                    </p>
                  </div>
                  <Switch
                    id="saveVideo"
                    checked={saveVideo}
                    onCheckedChange={(checked) => setSaveVideo(Boolean(checked))}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={() => startImportFromLink(false)}
                    disabled={isStartingImport || isSavingVideoOnly || importIsActive || !canImportFromLink}
                  >
                    {(isStartingImport || importIsActive) && !isSavingVideoOnly && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Import Recipe
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startImportFromLink(true)}
                    disabled={isStartingImport || isSavingVideoOnly || importIsActive || !canImportFromLink}
                  >
                    {(isSavingVideoOnly || importIsActive) && !isStartingImport && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Video
                  </Button>
                  {!canImportFromLink && sourceUrl.trim() && (
                    <p className="text-sm text-muted-foreground">
                      Automatic import currently supports public YouTube, Instagram, and TikTok URLs only.
                    </p>
                  )}
                </div>

                {importJob && (
                  <div className="rounded-lg border bg-muted/40 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          Import progress
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {getImportStageDescription(importJob)}
                        </p>
                      </div>
                      <Badge variant={importJob.status === "failed" ? "destructive" : "secondary"}>
                        {formatImportStageLabel(importJob)}
                      </Badge>
                    </div>

                    <Progress value={getImportProgressValue(importJob.progressStage)} className="h-2" />

                    <div className="grid gap-2 sm:grid-cols-4">
                      {IMPORT_PROGRESS_STEPS.map((step) => {
                        const stepState = getImportStepState(step.key, importJob.progressStage);
                        return (
                          <div
                            key={step.key}
                            className="rounded-md border bg-background/80 px-3 py-2"
                          >
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              {step.label}
                            </p>
                            <p className="text-sm font-medium">
                              {stepState === "complete" && "Complete"}
                              {stepState === "current" && (importJob.status === "failed" ? "Stopped" : "In progress")}
                              {stepState === "pending" && "Waiting"}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {importJob.status === "done" && (
                        <Button type="button" variant="outline" size="sm" onClick={() => handleLoadImportJob(importJob)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Load Into Form
                        </Button>
                      )}
                      {importJob.status === "failed" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRetryImportJob(importJob)}
                          disabled={retryingImportJobId === importJob.id}
                        >
                          {retryingImportJobId === importJob.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          {retryingImportJobId !== importJob.id && <RotateCcw className="w-4 h-4 mr-2" />}
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Recent imports
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reopen a recent import or retry a failed one without pasting the link again.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadImportHistory()} disabled={isLoadingImportHistory}>
                      {isLoadingImportHistory && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Refresh
                    </Button>
                  </div>

                  {recentImportHistory.length > 0 ? (
                    <div className="space-y-3">
                      {recentImportHistory.map((job) => (
                        <div key={job.id} className="rounded-md border bg-background/80 p-3 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="capitalize">{job.platform}</Badge>
                                <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>
                                  {job.status === "failed" ? "Failed" : formatImportStageLabel(job)}
                                </Badge>
                                {job.videoOnly && <Badge variant="outline">Video only</Badge>}
                              </div>
                              <p className="text-sm break-all">{job.sourceUrl}</p>
                              <p className="text-xs text-muted-foreground">
                                {getImportStageDescription(job)}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => handleLoadImportJob(job)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {job.status === "done" ? "Load Into Form" : "View Status"}
                            </Button>
                            {job.status === "failed" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void handleRetryImportJob(job)}
                                disabled={retryingImportJobId === job.id}
                              >
                                {retryingImportJobId === job.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {retryingImportJobId !== job.id && <RotateCcw className="w-4 h-4 mr-2" />}
                                Retry
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {isLoadingImportHistory ? "Loading recent imports..." : "No recent import jobs yet."}
                    </p>
                  )}
                </div>

                {videoUrl && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Saved recipe video</p>
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full rounded-lg border bg-black"
                    />
                  </div>
                )}

                {/* Video Preview */}
                {videoEmbed?.type === "youtube" && (
                  <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                    <iframe
                      src={`https://www.youtube.com/embed/${videoEmbed.id}`}
                      title="YouTube video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}

                {videoEmbed?.type === "instagram" && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">Instagram link saved:</p>
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      Open in Instagram <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {videoEmbed?.type === "tiktok" && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">TikTok link saved:</p>
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      Open in TikTok <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {sourceUrl && !videoEmbed && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">Source saved:</p>
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all flex items-center gap-1"
                    >
                      {sourceUrl} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recipe Form */}
            {renderRecipeForm("link-")}
          </TabsContent>
        </Tabs>
      </main>

      {/* Fixed Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="max-w-3xl mx-auto">
          <Button onClick={handleSubmit} className="w-full" size="lg">
            Save Recipe
          </Button>
        </div>
      </div>
    </div>
  );
}
