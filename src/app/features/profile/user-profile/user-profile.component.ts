import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutStateService } from '../../../core/services/layout-state.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss'
})
export class UserProfileComponent {
  public readonly layoutState = inject(LayoutStateService);
  public readonly authService = inject(AuthService);
  public user = this.authService.currentUser;

  // Edit Mode State
  public isEditing = signal<boolean>(false);
  public isSaving = signal<boolean>(false);
  public editForm = {
    displayName: '',
    bio: ''
  };

  public toggleEdit() {
    if (!this.isEditing()) {
      // Init form
      this.editForm.displayName = this.user()?.displayName || '';
      this.editForm.bio = this.user()?.bio || '';
    }
    this.isEditing.set(!this.isEditing());
  }

  public async saveProfile() {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    try {
      await this.authService.updateUserProfile({
        displayName: this.editForm.displayName,
        bio: this.editForm.bio
      });
      this.isEditing.set(false);
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      this.isSaving.set(false);
    }
  }
}
