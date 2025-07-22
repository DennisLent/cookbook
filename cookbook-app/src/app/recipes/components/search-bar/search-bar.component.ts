import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { Tag } from '../../recipes.model';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatAutocompleteModule
  ]
})
export class SearchBarComponent {
  @Input() availableTags: Tag[] = [];
  @Input() recipeTitles: string[] = [];
  @Output() search = new EventEmitter<{ term: string, tags: string[] }>();

  term = '';
  selectedTags: string[] = [];

  emitSearch() {
    this.search.emit({ term: this.term, tags: this.selectedTags });
  }

  removeTag(tag: string) {
    this.selectedTags = this.selectedTags.filter(t => t !== tag);
    this.emitSearch();
  }

  get autocompleteOptions(): string[] {
    if (!this.term) return this.recipeTitles.slice(0, 3);
    return this.recipeTitles
      .filter(title => title.toLowerCase().includes(this.term.toLowerCase()))
      .slice(0, 3);
  }

}