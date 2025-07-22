import { Component } from '@angular/core';
import { LayoutComponent } from './core/layout/layout.component';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [
    LayoutComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'cookbook-app';
  constructor(private auth: AuthService) {
    if (auth.getAccessToken() && !auth.isAuthenticated()) {
      auth.logout();
    }
  }
}
