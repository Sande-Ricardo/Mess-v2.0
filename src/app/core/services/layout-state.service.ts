import { Injectable, signal } from '@angular/core';

export type MenuView = 'profile' | 'settings' | 'notifications' | null;

@Injectable({
  providedIn: 'root'
})
export class LayoutStateService {
  isMainMenuOpen = signal<boolean>(false);
  activeMenuView = signal<MenuView>(null);

  openMenu() {
    this.isMainMenuOpen.set(true);
  }

  closeMenu() {
    this.isMainMenuOpen.set(false);
    this.activeMenuView.set(null);
  }

  toggleMenu() {
    if (this.isMainMenuOpen()) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openProfile() {
    this.activeMenuView.set('profile');
  }

  openSettings() {
    this.activeMenuView.set('settings');
  }

  openNotifications() {
    this.activeMenuView.set('notifications');
  }

  clearView() {
    this.activeMenuView.set(null);
  }
}
