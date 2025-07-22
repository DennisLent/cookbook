import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

export interface RegisterUser {
  username: string;
  password: string;
  password2: string;
  bio?: string;
  avatar?: File | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private apiUrl = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient, private router: Router) {}

  login(username: string, password: string) {
    return this.http.post(`${this.apiUrl}/token/`, { username, password });
  }

  register(user: RegisterUser): Observable<any> {
    const form = new FormData();
    form.append('username', user.username);
    form.append('password', user.password);
    form.append('password2', user.password2);

    if (user.bio) {
      form.append('bio', user.bio);
    }
    if (user.avatar) {
      form.append('avatar', user.avatar);
    }

    return this.http.post(`${this.apiUrl}/register/`, form);
  }

  saveTokens(tokens: { access: string; refresh: string }): Promise<void> {
    return new Promise((resolve) => {
      localStorage.setItem('access_token', tokens.access);
      localStorage.setItem('refresh_token', tokens.refresh);
      // console.log('[AuthService] Tokens saved');
      resolve();
    });
  }

  refreshAccessToken(): Observable<{ access: string }> {
    const refresh = this.getRefreshToken();
    if (!refresh) {
      throw new Error('No refresh token available');
    }
    return this.http.post<{ access: string }>(
      `${this.apiUrl}/token/refresh/`,
      { refresh }
    );
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.router.navigate(['']);
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('access_token');
  }

  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // console.log(JSON.parse(atob(token.split('.')[1])));
      const exp = payload.exp;
      // console.log('exp:', exp);
      // console.log('now:', Date.now() / 1000);
      return Date.now() / 1000 < exp;
    } catch {
      return false;
    }
  }

  getUsername(): string | null {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.username || null;
    } catch {
      return null;
    }
  }

  getCurrentUser() {
    const token = this.getAccessToken();
    if (!token) {
      console.log('[AuthService] could not retrieve token');
    }
    return this.http.get(`${environment.apiUrl}/users/me/`);
  }

  updateCurrentUser(formData: FormData) {
    return this.http.patch(`${environment.apiUrl}/users/me/`, formData);
  }
}
