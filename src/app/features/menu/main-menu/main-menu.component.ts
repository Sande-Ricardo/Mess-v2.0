import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutStateService } from '../../../core/services/layout-state.service';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.scss'
})
export class MainMenuComponent {
  public readonly layoutState = inject(LayoutStateService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public openProfile() {
    this.layoutState.openProfile();
  }

  public openNotifications() {
    this.layoutState.openNotifications();
  }

  public async logout() {
    await this.authService.signOut();
    this.layoutState.closeMenu();
    this.router.navigate(['/auth/login']);
  }
}
