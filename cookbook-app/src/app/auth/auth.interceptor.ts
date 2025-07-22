import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, switchMap, catchError, from } from 'rxjs';


export const AuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {
  const authService = inject(AuthService);
  const accessToken = authService.getAccessToken();
  const refreshToken = authService.getRefreshToken();

  const shouldAttachToken =
    accessToken &&
    authService.isAuthenticated() &&
    (req.url.includes('/api/') || req.url.includes('/recipes/preview'));

  const authReq = shouldAttachToken
    ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (
        err.status === 401 &&
        refreshToken &&
        !req.url.includes('/auth/token/')
      ) {
        return authService.refreshAccessToken().pipe(
          switchMap((res) =>
            from(
              authService.saveTokens({
                access: res.access,
                refresh: refreshToken
              })
            ).pipe(
              switchMap(() => {
                const retryReq = req.clone({
                  setHeaders: { Authorization: `Bearer ${res.access}` }
                });
                return next(retryReq);
              })
            )
          ),
          catchError((refreshErr) => {
            authService.logout();
            return throwError(() => refreshErr);
          })
        );
      }

      return throwError(() => err);
    })
  );
};
