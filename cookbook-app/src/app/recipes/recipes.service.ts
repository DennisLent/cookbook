import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { Recipe, Tag, Ingredient } from './recipes.model';

export interface PaginatedRecipes {
  count: number;
  next: string | null;
  previous: string | null;
  results: Recipe[];
}

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private baseUrl = `${environment.apiUrl}/recipes`;

  constructor(private http: HttpClient) {}

  getAllRecipes(): Observable<Recipe[]> {
    return this.http.get<Recipe[]>(this.baseUrl + '/');
  }

  getRecipesPage(page: number): Observable<PaginatedRecipes> {
    return this.http.get<PaginatedRecipes>(`${this.baseUrl}/?page=${page}`);
  }

  getById(id: number): Observable<Recipe> {
    return this.http.get<Recipe>(`${this.baseUrl}/${id}/`);
  }

  getAllTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${environment.apiUrl}/tags/`);
  }

  getAllIngredients(): Observable<Tag[]> {
    return this.http.get<Ingredient[]>(`${environment.apiUrl}/ingredients/`);
  }

  getCarouselSuggestions(): Observable<Recipe[]> {
    return this.http.get<Recipe[]>(this.baseUrl + '/suggestions/')
  }

  previewFromWebsite(url: string): Observable<Recipe> {
    return this.http.post<Recipe>(`${this.baseUrl}/preview/website/`, { url });
  }

  previewFromYoutube(video_url: string): Observable<Recipe> {
    return this.http.post<Recipe>(`${this.baseUrl}/preview/youtube/`, { video_url });
  }

  createRecipe(formData: FormData): Observable<Recipe> {
    return this.http.post<Recipe>(`${this.baseUrl}/`, formData);
  }
}
