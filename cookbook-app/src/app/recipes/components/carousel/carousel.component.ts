import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Recipe } from '../../recipes.model';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-carousel',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    RouterModule
  ],
  templateUrl: './carousel.component.html',
  styleUrl: './carousel.component.scss'
})
export class CarouselComponent implements OnInit, OnDestroy{
  @Input() recipes: Recipe[] = [];
  autoPlayInterval = 3000;
  currentIndex = 0;
  intervalId: any;

  // size related
  placeholderImage = 'assets/fallback-image.png';
  @ViewChild('scrollContainer', { static: true }) scrollContainer!: ElementRef<HTMLDivElement>;


  // Iterate to next id
  next(): void {
    this.currentIndex = (this.currentIndex + 1) % this.recipes.length;
  }

  // Iterate to previous id
  previous(): void {
    this.currentIndex = (this.currentIndex - 1 + this.recipes.length) % this.recipes.length;
  }

  // Start autoplay and set the new current index every interval
  startAutoPlay(): void {
    this.intervalId = setInterval(() => {
      this.next();
    }, this.autoPlayInterval)
  }

  // On start, play through all the indexes
  ngOnInit(): void {
    this.currentIndex = 3;
    this.startAutoPlay();
  }

  // Stop iteration
  stopAutoPlay(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  // when stopped, stop all the iteration
  ngOnDestroy(): void {
    this.stopAutoPlay();
  }

  scrollNext(): void {
    const el = this.scrollContainer.nativeElement;
    const cardWidth = el.querySelector('.carousel-card')?.clientWidth ?? 250;
    el.scrollBy({ left: cardWidth + 24, behavior: 'smooth' });
  }

  scrollPrev(): void {
    const el = this.scrollContainer.nativeElement;
    const cardWidth = el.querySelector('.carousel-card')?.clientWidth ?? 250;
    el.scrollBy({ left: -(cardWidth + 24), behavior: 'smooth' });
  }
}
