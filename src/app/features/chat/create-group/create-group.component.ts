import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, inject, Output, signal } from '@angular/core';
import { child, get } from '@angular/fire/database';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, debounceTime, distinctUntilChanged } from 'rxjs';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { FirebaseService } from '../../../core/services/firebase.service';
import { GroupService } from '../../../core/services/group.service';
import { ChatService } from '../../../core/services/chat.service';

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
  private chatService = inject(ChatService);
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
  private userSearch$ = new Subject<string>();
  
  public isSearching = signal<boolean>(false);
  public existingContacts = signal<User[]>([]);
  public searchResults = signal<User[]>([]);
  public selectedUids = signal<Set<string>>(new Set());
  public selectedUsersCache = signal<Map<string, User>>(new Map());

  public filteredUsers = computed(() => {
    // Combine search results and selected users
    const results = this.searchResults();
    const term = this.searchQuery().trim();
    
    const userMap = new Map<string, User>();
    
    // Always show selected users
    for (const u of Array.from(this.selectedUsersCache().values())) {
      userMap.set(u.uid, u);
    }
    
    // Add search results
    for (const u of results) {
      userMap.set(u.uid, u);
    }
    
    return Array.from(userMap.values());
  });

  constructor() {
    this.loadContacts();

    this.userSearch$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(async (term) => {
      if (!term.trim()) {
        this.searchResults.set(this.existingContacts());
        this.isSearching.set(false);
        return;
      }
      
      this.isSearching.set(true);
      
      const lowerTerm = term.toLowerCase();
      // 1. Local contacts match
      const localMatches = this.existingContacts().filter(u => 
         (u.displayName || '').toLowerCase().includes(lowerTerm) || 
         (u.username || '').toLowerCase().includes(lowerTerm)
      );

      // 2. Global exact search
      let globalUser: User | null = null;
      try {
        globalUser = await this.authService.searchUserByUsername(term);
      } catch (e) {
        // Ignore search errors
      }
      
      const map = new Map<string, User>();
      for (const u of localMatches) map.set(u.uid, u);
      if (globalUser) map.set(globalUser.uid, globalUser);

      this.searchResults.set(Array.from(map.values()));
      this.isSearching.set(false);
    });
  }

  private async loadContacts() {
    try {
      const convs = await firstValueFrom(this.chatService.getUserConversations());
      const myUid = this.authService.currentUser()?.uid;
      const uids = new Set<string>();
      
      for (const c of convs) {
        if (!c.participants) continue;
        for (const uid of Object.keys(c.participants)) {
          if (uid !== myUid) uids.add(uid);
        }
      }
      
      const loadedUsers: User[] = [];
      for (const uid of uids) {
        const u = await this.authService.getUserById(uid);
        if (u) loadedUsers.push(u);
      }
      
      this.existingContacts.set(loadedUsers);
      
      if (!this.searchQuery().trim()) {
        this.searchResults.set(loadedUsers);
      }
    } catch (e) {
      console.error('Failed to load contacts', e);
    }
  }

  public onSearchInput(term: string) {
    this.searchQuery.set(term);
    this.userSearch$.next(term);
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

  public toggleUserSelection(user: User) {
    const currentUids = new Set(this.selectedUids());
    const currentCache = new Map(this.selectedUsersCache());
    
    if (currentUids.has(user.uid)) {
      currentUids.delete(user.uid);
      currentCache.delete(user.uid);
    } else {
      currentUids.add(user.uid);
      currentCache.set(user.uid, user);
    }
    
    this.selectedUids.set(currentUids);
    this.selectedUsersCache.set(currentCache);
  }

  public async finishCreate() {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    try {
      let avatarUrl: string | undefined = undefined;
      const file = this.selectedFile();
      if (file) {
        const uploadResult = await firstValueFrom(this.cloudinaryService.uploadFile(file, 'group-avatars'));
        avatarUrl = uploadResult.secureUrl;
      }

      const memberUids = Array.from(this.selectedUids());
      const groupId = await this.groupService.createGroup(this.groupName(), avatarUrl, memberUids);

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
