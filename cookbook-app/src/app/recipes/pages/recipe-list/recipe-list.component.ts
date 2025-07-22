import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe, Tag } from '../../recipes.model';
import { RecipeService } from '../../recipes.service';
import { CarouselComponent } from '../../components/carousel/carousel.component';
import { RouterModule } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';

@Component({
  selector: 'app-recipe-list',
  standalone: true,
  imports: [
    CarouselComponent,
    CommonModule,
    RouterModule,
    MatChipsModule,
    MatCardModule,
    SearchBarComponent
  ],
  templateUrl: './recipe-list.component.html',
  styleUrl: './recipe-list.component.scss'
})
export class RecipeListComponent implements OnInit {
  recipes: Recipe[] = [];
  allTags: Tag[] = [];
  filteredRecipes: Recipe[] = [];
  recipeTitles: string[] = [];
  suggestedRecipes: Recipe[] = [];
  placeholderImage = 'assets/fallback-image.png';

  constructor(private recipeService: RecipeService) {}

  ngOnInit(): void {
    this.recipeService.getAllRecipes().subscribe({
      next: (data) => {
        this.recipes = data;
        this.filteredRecipes = data;
        this.recipeTitles = data.map(r => r.title);
      },
      error: (err) => console.error('Failed to fetch recipes:', err)
    });

    this.recipeService.getAllTags().subscribe({
      next: (data) => this.allTags = data,
      error: (err) => console.error('Failed to fetch tags', err)
    });

    this.recipeService.getCarouselSuggestions().subscribe({
      next: (data) => {
        this.suggestedRecipes = data;
      },
      error: (err) => {
        console.error(`Failed to get recipe suggestions`, err);
      }
    });
  }

  handleSearch({ term, tags }: { term: string; tags: string[] }) {
    this.filteredRecipes = this.recipes.filter(r =>
      (!term || r.title.toLowerCase().includes(term.toLowerCase())) &&
      (!tags.length || tags.every(tag => r.tags.includes(tag)))
    );
  }
}
