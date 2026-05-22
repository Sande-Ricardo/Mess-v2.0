import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LayoutStateService } from '../../../core/services/layout-state.service';
import { WebRTCService } from '../../../core/services/webrtc.service';
import { AppLogoComponent } from '../../../shared/components/logo/logo.component';
import { MainMenuComponent } from '../../menu/main-menu/main-menu.component';
import { UserProfileComponent } from '../../profile/user-profile/user-profile.component';
import { ContactProfileComponent } from '../../profile/contact-profile/contact-profile.component';
import { NotificationsComponent } from '../../settings/notifications/notifications.component';
import { ActiveCallComponent } from '../active-call/active-call.component';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';
import { IncomingCallModalComponent } from '../incoming-call-modal/incoming-call-modal.component';

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ConversationListComponent, IncomingCallModalComponent, ActiveCallComponent, AppLogoComponent, MainMenuComponent, UserProfileComponent, ContactProfileComponent, NotificationsComponent],
  templateUrl: './chat-layout.component.html',
  styleUrl: './chat-layout.component.scss'
})
export class ChatLayoutComponent implements OnInit {
  private readonly webrtcService = inject(WebRTCService);
  public readonly layoutState = inject(LayoutStateService);

  ngOnInit() {
    this.webrtcService.initIncomingListener();
  }

  // Logic could be expanded explicitly for resize listeners if JS-driven logic is needed.
  // Using pure CSS Grid with native DOM APIs for the specified responsive functionality.

}
