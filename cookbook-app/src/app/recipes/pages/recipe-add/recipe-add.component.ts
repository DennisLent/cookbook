// add-recipe.component.ts
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators, FormsModule} from '@angular/forms';
import { RecipeService } from '../../recipes.service';
import { Ingredient, Tag } from '../../recipes.model';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

@Component({
  selector: 'app-recipe-add',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatDividerModule,
    MatButtonToggleModule,
    FormsModule
  ],
  templateUrl: './recipe-add.component.html',
  styleUrls: ['./recipe-add.component.scss']
})
export class AddRecipeComponent implements OnInit {
  mode: 'manual' | 'website' | 'youtube' = 'manual';
  websiteUrl = '';
  videoUrl = '';
  isPreviewing = false;
  previewError = '';

  tags: Tag[] = [];

  recipeForm!: FormGroup;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  constructor(
    private fb: FormBuilder,
    private recipeService: RecipeService
  ) {}

  ngOnInit() {
    this.recipeService.getAllTags().subscribe(t => (this.tags = t));

    this.recipeForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      instructions: ['', Validators.required],
      tags: [[]],
      servings: [null],
      prep_time: [''],
      cook_time: [''],
      total_time: [''],
      ingredients_data: this.fb.array([]),
      image: [null]
    });
  }

  get ingredients(): FormArray {
    return this.recipeForm.get('ingredients_data') as FormArray;
  }

  addIngredient() {
    this.ingredients.push(
      this.fb.group({
        ingredient: ['', Validators.required],
        amount: ['', Validators.required]
      })
    );
  }

  removeIngredient(i: number) {
    this.ingredients.removeAt(i);
  }

  onFileChange(evt: Event) {
    const file = (evt.target as HTMLInputElement).files?.[0];
    if (file) {
      this.recipeForm.get('image')?.setValue(file);
    }
  }


  // PREVIEW FUNCTIONS
  onPreviewWebsite() {
    this.previewError = '';
    this.isPreviewing = true;
    this.recipeService.previewFromWebsite(this.websiteUrl).subscribe({
      next: recipe => this.populateForm(recipe),
      error: e =>
        (this.previewError = e.error?.detail || 'Preview failed'),
      complete: () => (this.isPreviewing = false)
    });
  }

  onPreviewYoutube() {
    this.previewError = '';
    this.isPreviewing = true;
    this.recipeService.previewFromYoutube(this.videoUrl).subscribe({
      next: recipe => this.populateForm(recipe),
      error: e =>
        (this.previewError = e.error?.detail || 'Preview failed'),
      complete: () => (this.isPreviewing = false)
    });
  }

  private parseTime(input: string): string {
    if (!input) return '';

    const hoursMatch = input.match(/(\d+)\s*h/);
    const minsMatch = input.match(/(\d+)\s*m/);
    const secsMatch = input.match(/(\d+)\s*s/);

    const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
    const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
    const secs = secsMatch ? parseInt(secsMatch[1], 10) : 0;

    return `${hours.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private populateForm(recipe: any) {
    this.recipeForm.patchValue({
      title: recipe.title ?? '',
      description: recipe.description ?? '',
      instructions: recipe.instructions ?? '',
      tags: recipe.tags ?? []
    });

    this.ingredients.clear();

    if (Array.isArray(recipe.ingredients_data)) {
      for (const ing of recipe.ingredients_data) {
        this.ingredients.push(
          this.fb.group({
            ingredient: [ing.ingredient, Validators.required],
            amount: [ing.amount, Validators.required]
          })
        );
      }
    }
  }

  // SUBMIT
  onSubmit() {
    if (this.recipeForm.invalid) return;

    const v = this.recipeForm.value;

    const ingredients = v.ingredients_data
      .filter((i: any) => i.ingredient && i.amount)
      .map((ing: any) => ({
        ingredient: typeof ing.ingredient === 'string'
          ? ing.ingredient
          : ing.ingredient?.name ?? '',
        amount: ing.amount ?? ''
      }));

    const baseData: any = {
      title: v.title,
      description: v.description ?? '',
      instructions: v.instructions,
      tags: v.tags,
      servings: v.servings,
      prep_time: this.parseTime(v.prep_time),
      cook_time: this.parseTime(v.cook_time),
      total_time: this.parseTime(v.total_time),
      ingredients_data: ingredients
    };

    if (v.image) {
      const fd = new FormData();

      Object.entries(baseData).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          if (key === 'ingredients_data') {
            value.forEach((val: any, idx: number) => {
              fd.append(`${key}[${idx}][ingredient]`, val.ingredient);
              fd.append(`${key}[${idx}][amount]`, val.amount);
            });
          } else {
            value.forEach((item: any, idx: number) => {
              fd.append(`${key}[${idx}]`, String(item));
            });
          }
        } else if (value !== null && value !== undefined) {
          fd.append(key, String(value));
        }
      });

      fd.append('image', v.image);

      this.recipeService.createRecipe(fd).subscribe({
        next: () => alert('Recipe created!'),
        error: err => {
          console.error('[Recipe Create Error]', err);
          alert('Failed to save recipe: ' + (err.error?.detail || err.message));
        }
      });

    } else {

      this.recipeService.createRecipe(baseData).subscribe({
        next: () => alert('Recipe created!'),
        error: err => {
          console.error('[Recipe Create Error]', err);
          alert('Failed to save recipe: ' + (err.error?.detail || err.message));
        }
      });
    }
  }

}