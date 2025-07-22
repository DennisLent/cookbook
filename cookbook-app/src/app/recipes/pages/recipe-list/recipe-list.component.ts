import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
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
export class RecipeListComponent implements OnInit, AfterViewInit, OnDestroy {
  recipes: Recipe[] = [];
  allTags: Tag[] = [];
  filteredRecipes: Recipe[] = [];
  recipeTitles: string[] = [];
  suggestedRecipes: Recipe[] = [];
  placeholderImage = 'assets/fallback-image.png';
  page = 1;
  loading = false;
  hasMore = true;
  lastSearch = { term: '', tags: [] as string[] };
  private observer?: IntersectionObserver;

  @ViewChild('anchor', { static: false }) anchor?: ElementRef<HTMLElement>;

  constructor(private recipeService: RecipeService) {}

  ngOnInit(): void {
    this.loadRecipes();

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

  ngAfterViewInit(): void {
    if (this.anchor) {
      this.observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadRecipes();
          }
        });
      });
      this.observer.observe(this.anchor.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  handleSearch({ term, tags }: { term: string; tags: string[] }) {
    this.lastSearch = { term, tags };
    this.filteredRecipes = this.recipes.filter(r =>
      (!term || r.title.toLowerCase().includes(term.toLowerCase())) &&
      (!tags.length || tags.every(tag => r.tags.includes(tag)))
    );
  }

  private loadRecipes() {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    this.recipeService.getRecipesPage(this.page).subscribe({
      next: data => {
        this.recipes.push(...data.results);
        this.recipeTitles = this.recipes.map(r => r.title);
        this.hasMore = !!data.next;
        this.page++;
        this.loading = false;
        this.handleSearch(this.lastSearch);
      },
      error: err => {
        console.error('Failed to fetch recipes:', err);
        this.loading = false;
      }
    });
  }
}
