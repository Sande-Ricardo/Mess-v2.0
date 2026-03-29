import { Component, inject, signal, computed, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GroupService } from '../../../core/services/group.service';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { AuthService } from '../../../core/services/auth.service';
import { get, child } from '@angular/fire/database';
import { User } from '../../../core/models/user.model';

@Component({
  selector: 'app-create-group',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-group.component.html',
  styleUrl: './create-group.component.scss'
})
export class CreateGroupComponent {
  private groupService = inject(GroupService);
  private cloudinaryService = inject(CloudinaryService);
  private fbService = inject(FirebaseService);
  private authService = inject(AuthService);
  private router = inject(Router);

  @Output() close = new EventEmitter<void>();

  public currentStep = signal<number>(1);
  public isSubmitting = signal<boolean>(false);

  // Step 1: Name
  public groupName = signal<string>('');

  // Step 2: Avatar
  public selectedFile = signal<File | null>(null);
  public avatarPreview = signal<string | null>(null);

  // Step 3: Members
  public searchQuery = signal<string>('');
  public users = signal<User[]>([]);
  public selectedUids = signal<Set<string>>(new Set());

  public filteredUsers = computed(() => {
    const term = this.searchQuery().toLowerCase();
    const myUid = this.authService.currentUser()?.uid;
    return this.users().filter(u => 
      u.uid !== myUid && 
      (u.displayName.toLowerCase().includes(term) || u.username.toLowerCase().includes(term))
    );
  });

  constructor() {
    this.loadUsers();
  }

  private async loadUsers() {
    // In a real app with thousands of users, we'd search server-side or paginate
    const usersRef = child(this.fbService.rootRef, 'users');
    const snap = await get(usersRef);
    if (snap.exists()) {
      const allUsers = Object.values(snap.val()) as User[];
      this.users.set(allUsers);
    }
  }

  public nextStep() {
    if (this.currentStep() === 1 && !this.groupName().trim()) return;
    this.currentStep.update(s => Math.min(s + 1, 3));
  }

  public prevStep() {
    this.currentStep.update(s => Math.max(s - 1, 1));
  }

  public onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile.set(file);
      const reader = new FileReader();
      reader.onload = e => this.avatarPreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  public toggleUserSelection(uid: string) {
    const current = new Set(this.selectedUids());
    if (current.has(uid)) {
      current.delete(uid);
    } else {
      current.add(uid);
    }
    this.selectedUids.set(current);
  }

  public async finishCreate() {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    try {
      let avatarUrl: string | undefined = undefined;
      const file = this.selectedFile();
      if (file) {
         avatarUrl = await this.cloudinaryService.uploadImage(file);
      }

      const groupId = await this.groupService.createGroup(this.groupName(), avatarUrl);

      // Add selected members sequentially (or could be Promise.all)
      for (const uid of this.selectedUids()) {
         await this.groupService.addMember(groupId, uid);
      }

      this.closeModal();
      this.router.navigate(['/chat', groupId]);

    } catch (err) {
      console.error('Error creating group', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  public closeModal() {
    this.close.emit();
  }
}
