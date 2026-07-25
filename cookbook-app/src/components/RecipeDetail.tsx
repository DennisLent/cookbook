// Full recipe detail presentation with social actions, linked suggestions, and editing controls.

import { Recipe } from "@/types/recipe";
import { Clock, Users, ChefHat, X, Share2, Trash2, Edit, Heart, Salad, Droplets, FolderPlus, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecipes } from "@/hooks/useRecipes";
import { useSocial } from "@/hooks/useSocial";
import { useAuth } from "@/hooks/useAuth";
import { useCollections } from "@/hooks/useCollections";
import { toast } from "@/hooks/use-toast";
import { StarRating } from "@/components/StarRating";
import { CommentSection } from "@/components/CommentSection";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api";

interface RecipeDetailProps {
  recipe: Recipe;
  onClose: () => void;
  onStartCookMode: () => void;
}

function getSourceLabel(recipe: Recipe) {
  const normalizedOrigin = recipe.origin?.trim().toLowerCase();

  if (normalizedOrigin === "manual") {
    return "Manual";
  }
  if (normalizedOrigin === "youtube") {
    return "YouTube";
  }
  if (normalizedOrigin === "instagram") {
    return "Instagram";
  }
  if (normalizedOrigin === "tiktok") {
    return "TikTok";
  }
  if (normalizedOrigin === "website") {
    return "Website";
  }

  if (recipe.sourceUrl) {
    try {
      const hostname = new URL(recipe.sourceUrl).hostname.toLowerCase();
      if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "YouTube";
      if (hostname.includes("instagram.com")) return "Instagram";
      if (hostname.includes("tiktok.com")) return "TikTok";
    } catch {
      // Ignore malformed URLs and fall through to generic labels.
    }
    return "Website";
  }

  return "Manual";
}

export const RecipeDetail = ({ recipe, onClose, onStartCookMode }: RecipeDetailProps) => {
  const navigate = useNavigate();
  const { recipes, deleteRecipe } = useRecipes();
  const { getAverageRating, getUserRating, rateRecipe, isFavorite, toggleFavorite } = useSocial();
  const { isAuthenticated, mode } = useAuth();
  const { collections, addToCollection, removeFromCollection, isInCollection } = useCollections();
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
 
   const { average, count } = getAverageRating(recipe.id);
   const userRating = getUserRating(recipe.id);
   const favorite = isFavorite(recipe.id);

  const toggleIngredient = (index: number) => {
    const newChecked = new Set(checkedIngredients);
    if (newChecked.has(index)) {
      newChecked.delete(index);
    } else {
      newChecked.add(index);
    }
    setCheckedIngredients(newChecked);
  };

   const handleRate = async (value: number) => {
     try {
       await rateRecipe(recipe.id, value);
       toast({ title: `Rated ${value} star${value > 1 ? "s" : ""}` });
     } catch (error) {
       toast({
         title: "Failed to save rating",
         description: getApiErrorMessage(error, "The recipe rating could not be saved."),
         variant: "destructive",
       });
     }
   };
 
   const handleFavoriteClick = async () => {
     try {
       await toggleFavorite(recipe.id);
       toast({ title: favorite ? "Removed from favorites" : "Added to favorites" });
     } catch (error) {
       toast({
         title: "Failed to update favorite",
         description: getApiErrorMessage(error, "The favorite status could not be updated."),
         variant: "destructive",
       });
     }
   };
 
  const handleShare = async () => {
    const url = `${window.location.origin}/recipes/${recipe.id}`;
    const text = `${recipe.title}\n\n${recipe.description || ""}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: recipe.title, text, url });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied to clipboard" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRecipe(recipe.id);
      toast({ title: "Recipe deleted" });
      onClose();
    } catch (error) {
      toast({
        title: "Failed to delete recipe",
        description: getApiErrorMessage(error, "The recipe could not be deleted."),
        variant: "destructive",
      });
    }
  };

  const totalTime = (recipe.prepMin || 0) + (recipe.cookMin || 0);
  const sourceLabel = getSourceLabel(recipe);
  const showSourceLink = Boolean(recipe.sourceUrl && sourceLabel !== "Manual");
  const showManualCreator = !showSourceLink && Boolean(recipe.created_by);

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="min-h-screen">
        {/* Hero Section */}
        <div className="relative h-64 md:h-96 bg-muted">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No image available
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-8 w-8 sm:h-10 sm:w-10 bg-background/80 backdrop-blur hover:bg-background"
            onClick={onClose}
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="absolute top-4 right-14 sm:right-16 flex gap-1 sm:gap-2">
             {isAuthenticated && (
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8 sm:h-10 sm:w-10 bg-background/80 backdrop-blur hover:bg-background"
                 onClick={handleFavoriteClick}
               >
                 <Heart
                   className={cn(
                     "h-4 w-4 sm:h-5 sm:w-5 transition-colors",
                     favorite ? "fill-destructive text-destructive" : ""
                   )}
                 />
               </Button>
             )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10 bg-background/80 backdrop-blur hover:bg-background"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10 bg-background/80 backdrop-blur hover:bg-background"
              onClick={() => navigate(`/edit/${recipe.id}`)}
            >
              <Edit className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
             <Button
               variant="ghost"
               size="icon"
               className="h-8 w-8 sm:h-10 sm:w-10 bg-background/80 backdrop-blur hover:bg-background"
               onClick={() => setShowDeleteDialog(true)}
             >
               <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
             </Button>
             {collections.length > 0 && (
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button
                     variant="ghost"
                     size="icon"
                     className="h-8 w-8 sm:h-10 sm:w-10 bg-background/80 backdrop-blur hover:bg-background"
                   >
                     <FolderPlus className="h-4 w-4 sm:h-5 sm:w-5" />
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end">
                   {collections.map((col) => {
                     const inCol = isInCollection(col.id, recipe.id);
                     return (
                       <DropdownMenuItem
                         key={col.id}
                         onClick={() => {
                           if (inCol) {
                             removeFromCollection(col.id, recipe.id);
                             toast({ title: `Removed from "${col.name}"` });
                           } else {
                             addToCollection(col.id, recipe.id);
                             toast({ title: `Added to "${col.name}"` });
                           }
                         }}
                       >
                         {inCol && <Check className="w-4 h-4 mr-2 text-primary" />}
                         {!inCol && <span className="w-4 mr-2" />}
                         {col.name}
                       </DropdownMenuItem>
                     );
                   })}
                 </DropdownMenuContent>
               </DropdownMenu>
             )}
           </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 py-8 md:px-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="space-y-4">
              <h1 className="text-3xl md:text-4xl font-bold">{recipe.title}</h1>
              
              {recipe.description && (
                <p className="text-lg text-muted-foreground">{recipe.description}</p>
              )}

              {/* Tags */}
              {recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {recipe.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Meta Info */}
              <div className="flex flex-wrap gap-6 text-muted-foreground">
                {recipe.prepMin && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    <div className="text-sm">
                      <div className="font-medium text-foreground">Prep</div>
                      <div>{recipe.prepMin} min</div>
                    </div>
                  </div>
                )}
                {recipe.cookMin && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    <div className="text-sm">
                      <div className="font-medium text-foreground">Cook</div>
                      <div>{recipe.cookMin} min</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">Servings</div>
                    <div>{recipe.servings}</div>
                  </div>
                </div>
              </div>

              {(showSourceLink || showManualCreator) && (
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="text-sm font-medium text-foreground">Source</div>
                  {showSourceLink ? (
                    <a
                      href={recipe.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
                    >
                      {sourceLabel}: {recipe.sourceUrl}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {sourceLabel}: added by <span className="font-medium text-foreground">{recipe.created_by}</span>
                    </div>
                  )}
                </div>
              )}

              {recipe.videoUrl && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Recipe Video</div>
                  <video
                    src={recipe.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full rounded-xl border bg-black"
                  />
                </div>
              )}

             {/* Rating Section */}
             <div className="space-y-2">
               <div className="flex items-center gap-4">
                 {mode !== "single_user" && <div className="flex items-center gap-2">
                   <StarRating rating={average} size="lg" showCount count={count} />
                   {count > 0 && (
                     <span className="text-sm text-muted-foreground">
                       ({average.toFixed(1)})
                     </span>
                   )}
                 </div>}
               </div>
               
               {isAuthenticated && (
                 <div className="flex items-center gap-2">
                   <span className="text-sm text-muted-foreground">
                     {mode === "single_user" ? "Rating:" : "Your rating:"}
                   </span>
                   <StarRating
                     rating={userRating || 0}
                     size="lg"
                     interactive
                     onRate={handleRate}
                   />
                 </div>
               )}
             </div>
 
              {/* Cook Mode Button */}
              <Button size="lg" className="w-full md:w-auto" onClick={onStartCookMode}>
                <ChefHat className="w-5 h-5 mr-2" />
                Start Cook Mode
              </Button>
            </div>

            <Separator />

            {/* Two Column Layout for Desktop */}
            <div className="grid md:grid-cols-[300px_1fr] gap-8">
              {/* Ingredients */}
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Ingredients</h2>
                <div className="space-y-3">
                  {recipe.ingredients.map((ingredient, index) => (
                    <label
                      key={index}
                      className="flex items-start gap-3 cursor-pointer group"
                    >
                      <Checkbox
                        checked={checkedIngredients.has(index)}
                        onCheckedChange={() => toggleIngredient(index)}
                        className="mt-1"
                      />
                      <span
                        className={`text-sm flex-1 transition-colors ${
                          checkedIngredients.has(index)
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {ingredient.qty && `${ingredient.qty} `}
                        {ingredient.unit && `${ingredient.unit} `}
                        {ingredient.item}
                        {ingredient.note && (
                          <span className="text-muted-foreground"> ({ingredient.note})</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Instructions</h2>
                {recipe.steps.length > 0 ? (
                  <div className="space-y-6">
                    {recipe.steps.map((step) => (
                      <div key={step.order} className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                          {step.order}
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className="leading-relaxed">{step.text}</p>
                          {step.imageUrl && (
                            <img
                              src={step.imageUrl}
                              alt={`Step ${step.order}`}
                              className="rounded-lg border max-h-64 object-cover"
                            />
                          )}
                          {step.timerSec && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              <span>{Math.floor(step.timerSec / 60)} minutes</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recipe.videoUrl ? (
                  <p className="text-muted-foreground">
                    This recipe is meant to be followed from the saved video.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Suggested Sides */}
            {recipe.suggestedSideIds && recipe.suggestedSideIds.length > 0 && (() => {
              const sides = recipe.suggestedSideIds
                .map((id) => recipes.find((r) => r.id === id))
                .filter(Boolean) as Recipe[];
              if (sides.length === 0) return null;
              return (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                      <Salad className="w-5 h-5 text-primary" />
                      Suggested Sides
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {sides.map((side) => (
                        <button
                          key={side.id}
                          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                        >
                          {side.imageUrl ? (
                            <img src={side.imageUrl} alt={side.title} className="w-12 h-12 rounded-md object-cover shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Salad className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{side.title}</p>
                            {side.description && <p className="text-xs text-muted-foreground line-clamp-1">{side.description}</p>}
                            {(side.prepMin || side.cookMin) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                <Clock className="w-3 h-3 inline mr-1" />{(side.prepMin || 0) + (side.cookMin || 0)} min
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Suggested Sauces */}
            {recipe.suggestedSauceIds && recipe.suggestedSauceIds.length > 0 && (() => {
              const sauces = recipe.suggestedSauceIds
                .map((id) => recipes.find((r) => r.id === id))
                .filter(Boolean) as Recipe[];
              if (sauces.length === 0) return null;
              return (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-primary" />
                      Suggested Sauces & Condiments
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {sauces.map((sauce) => (
                        <button
                          key={sauce.id}
                          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                        >
                          {sauce.imageUrl ? (
                            <img src={sauce.imageUrl} alt={sauce.title} className="w-12 h-12 rounded-md object-cover shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Droplets className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{sauce.title}</p>
                            {sauce.description && <p className="text-xs text-muted-foreground line-clamp-1">{sauce.description}</p>}
                            {(sauce.prepMin || sauce.cookMin) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                <Clock className="w-3 h-3 inline mr-1" />{(sauce.prepMin || 0) + (sauce.cookMin || 0)} min
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
 
           {/* Comments Section */}
           <Separator />
           <CommentSection recipeId={recipe.id} />
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete "{recipe.title}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
