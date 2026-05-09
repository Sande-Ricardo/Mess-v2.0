import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutStateService } from '../../../core/services/layout-state.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.scss'
})
export class MainMenuComponent {
  layoutState = inject(LayoutStateService);

  openProfile() {
    this.layoutState.openProfile();
  }
}
