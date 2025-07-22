import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { NgModule } from '@angular/core';
import { MaterialModule } from './app/material/material.module';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
