import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../../auth.service';
import { Router, RouterModule } from '@angular/router';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    RouterModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  username = '';
  password = '';
  error = '';
  hidePassword = true;
  showGreeting = false;

  constructor(private auth: AuthService, private router: Router) {}

  login() {
    this.error = '';
    this.auth.login(this.username, this.password).subscribe({
      next: (tokens: any) => {
        this.auth.saveTokens(tokens);

        this.showGreeting = true;

        setTimeout(() => {
          this.router.navigate(['']);
        }, 1500);
      },
      error: () => {
        this.error = 'Invalid username or password';
      }
    });
  }


  togglePasswordVisibility() {
    this.hidePassword = !this.hidePassword;
  }
}

