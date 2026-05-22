import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificationLevel, NotificationSettings } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { LayoutStateService } from '../../../core/services/layout-state.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
  public readonly notificationService = inject(NotificationService);
  public readonly authService = inject(AuthService);
  public readonly layoutState = inject(LayoutStateService);

  public async updateDefaultLevel(level: NotificationLevel) {
    const user = this.authService.currentUser();
    if (!user) return;

    const currentSettings = user.notificationSettings || { defaultLevel: 'normal', dailySummary: false, conversations: {} };

    const newSettings: NotificationSettings = {
      ...currentSettings,
      defaultLevel: level
    };

    await this.authService.updateUserProfile({ notificationSettings: newSettings });
  }

  public async updateDailySummary(enabled: boolean) {
    const user = this.authService.currentUser();
    if (!user) return;

    const currentSettings = user.notificationSettings || { defaultLevel: 'normal', dailySummary: false, conversations: {} };

    const newSettings: NotificationSettings = {
      ...currentSettings,
      dailySummary: enabled
    };

    await this.authService.updateUserProfile({ notificationSettings: newSettings });
  }

  public async requestPermissions() {
    await this.notificationService.requestPermission();
  }
}
