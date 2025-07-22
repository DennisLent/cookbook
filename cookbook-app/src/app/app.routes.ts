import { Routes } from '@angular/router';
import { RecipeListComponent } from './recipes/pages/recipe-list/recipe-list.component';
import { RecipeDetailComponent } from './recipes/pages/recipe-detail/recipe-detail.component';
import { LoginComponent } from './auth/pages/login/login.component';
import { RegisterComponent } from './auth/pages/register/register.component';
import { AuthGuard } from './auth/auth,guard';
import { ProfileComponent } from './auth/pages/profile/profile.component';
import { AddRecipeComponent } from './recipes/pages/recipe-add/recipe-add.component';

export const routes: Routes = [
  {
    path: '', component: RecipeListComponent,
  },
  {
    path: 'recipes/:id', component: RecipeDetailComponent,
  },
  {
    path: 'login', component: LoginComponent,
  },
  {
    path: 'register', component: RegisterComponent,
  },
  {
    path: 'profile', component: ProfileComponent, canActivate: [AuthGuard]
  },
  {
    path: 'add', component: AddRecipeComponent, canActivate: [AuthGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];