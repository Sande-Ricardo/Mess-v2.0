import { Injectable, signal } from '@angular/core';

export type MenuView = 'profile' | 'settings' | 'notifications' | 'contact-profile' | 'group-profile' | null;

@Injectable({
  providedIn: 'root'
})
export class LayoutStateService {
  isMainMenuOpen = signal<boolean>(false);
  activeMenuView = signal<MenuView>(null);

  // Payload signals for context-aware views
  activeContactId = signal<string | null>(null);
  isGroupContact = signal<boolean>(false);

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

  openContactProfile(targetId: string, isGroup: boolean = false) {
    this.activeContactId.set(targetId);
    this.isGroupContact.set(isGroup);
    this.activeMenuView.set('contact-profile');
  }

  openGroupProfile(groupId: string) {
    this.activeContactId.set(groupId);
    this.isGroupContact.set(true);
    this.activeMenuView.set('group-profile');
  }

  clearView() {
    this.activeMenuView.set(null);
    this.activeContactId.set(null);
  }
}
