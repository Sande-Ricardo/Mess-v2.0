import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebRTCService } from '../../../core/services/webrtc.service';
import { ActiveCallComponent } from '../active-call/active-call.component';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';
import { IncomingCallModalComponent } from '../incoming-call-modal/incoming-call-modal.component';
import { AppLogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ConversationListComponent, IncomingCallModalComponent, ActiveCallComponent, AppLogoComponent],
  templateUrl: './chat-layout.component.html',
  styleUrl: './chat-layout.component.scss'
})
export class ChatLayoutComponent implements OnInit {
  private readonly webrtcService = inject(WebRTCService);

  ngOnInit() {
    this.webrtcService.initIncomingListener();
  }

  // Logic could be expanded explicitly for resize listeners if JS-driven logic is needed.
  // Using pure CSS Grid with native DOM APIs for the specified responsive functionality.

}
