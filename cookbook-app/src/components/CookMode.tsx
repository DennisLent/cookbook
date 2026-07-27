// Focused cooking interface with timers, step navigation, and ingredient highlighting.

import { Recipe } from "@/types/recipe";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Minus, Plus, Clock, Play, Pause, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { matchIngredientsForStep } from "@/lib/ingredientMatcher";

interface CookModeProps {
  recipe: Recipe;
  onClose: () => void;
}

function parseQuantityValue(raw: string) {
  const trimmed = raw.trim();
  if (/^\d+\.\d+$/.test(trimmed) || /^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (!fractionMatch) {
    return null;
  }

  const numerator = Number(fractionMatch[1]);
  const denominator = Number(fractionMatch[2]);
  if (!denominator) {
    return null;
  }
  return numerator / denominator;
}

export const CookMode = ({ recipe, onClose }: CookModeProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [servings, setServings] = useState(recipe.servings);
  const [timer, setTimer] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const step = recipe.steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === recipe.steps.length - 1;
  const servingMultiplier = servings / recipe.servings;

  // Auto-match ingredients for each step
  const stepIngredientIndices = useMemo(() => {
    return recipe.steps.map((s) =>
      matchIngredientsForStep(s.text, recipe.ingredients, s.ingredientIndices)
    );
  }, [recipe.steps, recipe.ingredients]);

  const currentIngredientIndices = stepIngredientIndices[currentStep] || [];

  // Timer logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  const handlePrevStep = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
      resetTimer();
    }
  };

  const handleNextStep = () => {
    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
      resetTimer();
    }
  };

  const startTimer = (seconds: number) => {
    setTimer(seconds);
    setTimerSeconds(seconds);
    setIsTimerRunning(true);
  };

  const toggleTimer = () => {
    setIsTimerRunning(!isTimerRunning);
  };

  const resetTimer = () => {
    setTimer(null);
    setTimerSeconds(0);
    setIsTimerRunning(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const scaleIngredient = (ingredient: typeof recipe.ingredients[0]) => {
    if (!ingredient.qty) return ingredient;
    const qtyMatch = ingredient.qty.match(/^(\d+(?:\/\d+)?|\d+\.\d+)/);
    if (qtyMatch) {
      const num = parseQuantityValue(qtyMatch[1]);
      if (num === null) {
        return ingredient;
      }
      const scaled = (num * servingMultiplier).toFixed(2).replace(/\.?0+$/, "");
      return {
        ...ingredient,
        qty: ingredient.qty.replace(qtyMatch[1], scaled),
      };
    }
    return ingredient;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="flex h-dvh flex-col">
        {/* Header */}
        <div className="shrink-0 border-b p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold line-clamp-1">{recipe.title}</h1>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6 md:p-12 space-y-8">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Step {currentStep + 1} of {recipe.steps.length}</span>
                <span>{Math.round(((currentStep + 1) / recipe.steps.length) * 100)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / recipe.steps.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Step Content */}
            <div className="space-y-6">
              <div className="flex items-center justify-center">
                <Badge variant="outline" className="text-lg px-4 py-2">
                  Step {step.order}
                </Badge>
              </div>

              <p className="text-2xl md:text-3xl leading-relaxed text-center">
                {step.text}
              </p>

              {/* Step Image */}
              {step.imageUrl && (
                <div className="flex justify-center">
                  <img
                    src={step.imageUrl}
                    alt={`Step ${step.order}`}
                    className="rounded-lg border max-h-72 object-cover"
                  />
                </div>
              )}

              {/* Ingredients used in this step */}
              {currentIngredientIndices.length > 0 && (
                <div className="p-4 bg-accent/50 border border-accent rounded-lg space-y-2">
                  <h4 className="text-sm font-semibold text-accent-foreground flex items-center gap-2">
                    🧂 Ingredients for this step
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {currentIngredientIndices.map((idx) => {
                      const ing = scaleIngredient(recipe.ingredients[idx]);
                      if (!ing) return null;
                      return (
                        <Badge key={idx} variant="secondary" className="text-sm py-1 px-3">
                          {ing.qty && `${ing.qty} `}
                          {ing.unit && `${ing.unit} `}
                          {ing.item}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timer */}
              {step.timerSec && (
                <div className="flex flex-col items-center gap-4 p-6 bg-card border rounded-lg">
                  {timer === null ? (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => startTimer(step.timerSec!)}
                    >
                      <Clock className="w-5 h-5 mr-2" />
                      Start {Math.floor(step.timerSec / 60)} min timer
                    </Button>
                  ) : (
                    <>
                      <div className="text-5xl font-bold tabular-nums">
                        {formatTime(timerSeconds)}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={toggleTimer}>
                          {isTimerRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </Button>
                        <Button variant="outline" size="icon" onClick={resetTimer}>
                          <RotateCcw className="w-5 h-5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Servings Adjuster */}
              <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Servings:</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Decrease servings"
                    onClick={() => setServings(Math.max(1, servings - 1))}
                    disabled={servings <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-lg font-semibold w-12 text-center">{servings}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Increase servings"
                    onClick={() => setServings(servings + 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Full Ingredients on first step */}
              {currentStep === 0 && (
                <div className="p-6 bg-card border rounded-lg space-y-3">
                  <h3 className="font-semibold text-lg">Ingredients</h3>
                  <div className="space-y-2 text-sm">
                    {recipe.ingredients.map((ingredient, idx) => {
                      const scaled = scaleIngredient(ingredient);
                      return (
                        <div key={idx} className="text-muted-foreground">
                          {scaled.qty && `${scaled.qty} `}
                          {scaled.unit && `${scaled.unit} `}
                          {scaled.item}
                          {scaled.note && ` (${scaled.note})`}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="shrink-0 border-t bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePrevStep}
              disabled={isFirstStep}
              className="flex-1 md:flex-initial"
            >
              <ChevronLeft className="w-5 h-5 mr-2" />
              Previous
            </Button>
            <div className="hidden md:block text-sm text-muted-foreground">
              Step {currentStep + 1} of {recipe.steps.length}
            </div>
            <Button
              size="lg"
              onClick={isLastStep ? onClose : handleNextStep}
              className="flex-1 md:flex-initial"
            >
              {isLastStep ? "Finish" : "Next"}
              {!isLastStep && <ChevronRight className="w-5 h-5 ml-2" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
