import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { provideIcons } from '@ng-icons/core';
import { ionLogoGithub, ionLogoLinkedin, ionHome, ionAddCircle, ionBook, ionAnalytics, ionReceipt } from '@ng-icons/ionicons';
import { AuthInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideHttpClient(withInterceptors([AuthInterceptor])),
    provideIcons({
      ionLogoGithub,
      ionLogoLinkedin,
      ionHome,
      ionAddCircle,
      ionBook,
      ionAnalytics,
      ionReceipt
    })
  ]
};
