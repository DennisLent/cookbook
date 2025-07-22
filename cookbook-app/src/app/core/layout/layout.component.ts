import { Component } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { OverlayContainer } from '@angular/cdk/overlay';
import { HeaderComponent } from '../header/header.component';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { map, filter } from 'rxjs/operators';
import { SidenavComponent } from '../sidenav/sidenav.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { FooterComponent } from '../footer/footer.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    RouterModule, 
    SidenavComponent,
    MatSidenavModule,
    FooterComponent
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {
  isHandset = false;
  drawerOpened = false;
  isLogin = false;
  

  constructor(
    private breakpointObserver: BreakpointObserver, 
    private overlayContainer: OverlayContainer,
    private router: Router
  ) {
    this.breakpointObserver.observe([Breakpoints.Handset])
      .pipe(map(result => result.matches))
      .subscribe(isHandset => {
        this.isHandset = isHandset;

      });
    
    const layoutExcludedRoutes = ['/login', '/register'];

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isLogin = layoutExcludedRoutes.includes(event.url);
      });

  }

  onToggleSidenav() {
    if (this.isHandset) {
      this.drawerOpened = !this.drawerOpened;
    }
  }
}
