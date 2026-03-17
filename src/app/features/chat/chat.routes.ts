import { Routes } from '@angular/router';
import { ChatLayoutComponent } from './chat-layout/chat-layout.component';

export const CHAT_ROUTES: Routes = [
  {
    path: '',
    component: ChatLayoutComponent,
    children: [
      {
        path: ':convId',
        loadComponent: () => import('./chat-window/chat-window.component').then(m => m.ChatWindowComponent)
      }
    ]
  }
];
