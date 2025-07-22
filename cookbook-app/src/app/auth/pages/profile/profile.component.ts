import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../auth.service';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  user: any = {};
  updatedUser: any = {};
  avatarPreview: string | ArrayBuffer | null = null;
  error = '';
  success = false;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.getCurrentUser().subscribe({
      next: (data) => {
        this.user = data;
        this.updatedUser = { ...data };
      },
      error: () => {
        this.error = 'Failed to load user data';
      }
    });
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      this.updatedUser.avatar = file;

      const reader = new FileReader();
      reader.onload = () => {
        this.avatarPreview = reader.result;
      };
      reader.readAsDataURL(file);
    }
  }

  saveChanges() {
    const formData = new FormData();
    for (const key in this.updatedUser) {
      if (this.updatedUser[key] !== undefined && key !== 'username') {
        formData.append(key, this.updatedUser[key]);
      }
    }

    this.authService.updateCurrentUser(formData).subscribe({
      next: () => this.success = true,
      error: () => this.error = 'Failed to update profile'
    });
  }
}
