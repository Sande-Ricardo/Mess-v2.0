import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ConversationListComponent],
  templateUrl: './chat-layout.component.html',
  styleUrl: './chat-layout.component.scss'
})
export class ChatLayoutComponent {
  
  // Logic could be expanded explicitly for resize listeners if JS-driven logic is needed.
  // Using pure CSS Grid with native DOM APIs for the specified responsive functionality.

}
