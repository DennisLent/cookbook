import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RecipeService } from '../../recipes.service';
import { Recipe, Comment } from '../../recipes.model';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  standalone: true,
  selector: 'app-recipe-detail',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDividerModule
  ],
  templateUrl: './recipe-detail.component.html',
  styleUrls: ['./recipe-detail.component.scss']
})
export class RecipeDetailComponent implements OnInit {
  recipe: Recipe & {
    prep_time?: string;
    cook_time?: string;
    total_time?: string;
    comments?: Comment[];
  } | null = null;

  loading = true;
  error: string | null = null;

  ingredientChecks: boolean[] = [];
  instructionsArray: string[] = [];

  placeholderImage = 'assets/fallback-image.png';
  emptyCommentsImage = 'assets/empty.png';

  constructor(
    private route: ActivatedRoute,
    private recipeService: RecipeService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.error = 'Invalid recipe ID';
      this.loading = false;
      return;
    }

    this.recipeService.getById(id).subscribe({
      next: (data) => {
        this.recipe = data as any; // cast to include times & comments
        this.ingredientChecks = data.ingredients.map(() => false);
        this.instructionsArray = data.instructions
          .split('\n')
          .map(s => s.trim())
          .filter(s => s);

        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to fetch recipe:', err);
        this.error = 'Recipe not found or failed to load.';
        this.loading = false;
      }
    });
  }
}
