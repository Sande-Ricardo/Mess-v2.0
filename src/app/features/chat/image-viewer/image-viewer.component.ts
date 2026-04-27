import { Component, Input, Output, EventEmitter, HostListener, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-viewer.component.html',
  styleUrl: './image-viewer.component.scss'
})
export class ImageViewerComponent implements OnInit {
  @Input({ required: true }) images!: string[];
  @Input() initialIndex: number = 0;
  @Output() dismiss = new EventEmitter<void>();

  public currentIndex = signal<number>(0);

  ngOnInit() {
    // Failsafe bounds check
    let validIndex = this.initialIndex;
    if (validIndex < 0 || validIndex >= this.images.length) {
       validIndex = 0;
    }
    this.currentIndex.set(validIndex);
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.close();
    } else if (event.key === 'ArrowRight') {
      this.nextImage(event);
    } else if (event.key === 'ArrowLeft') {
      this.prevImage(event);
    }
  }

  public nextImage(event?: Event) {
    if (event) event.stopPropagation();
    if (this.images.length <= 1) return;
    this.currentIndex.update(index => (index < this.images.length - 1 ? index + 1 : 0));
  }

  public prevImage(event?: Event) {
    if (event) event.stopPropagation();
    if (this.images.length <= 1) return;
    this.currentIndex.update(index => (index > 0 ? index - 1 : this.images.length - 1));
  }

  public close() {
    this.dismiss.emit();
  }
}
