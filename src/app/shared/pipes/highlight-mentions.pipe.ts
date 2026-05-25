import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'highlightMentions',
  standalone: true
})
export class HighlightMentionsPipe implements PipeTransform {
  transform(text: string): string {
    if (!text) return text;

    // 1. Escape HTML to prevent injection and accidental formatting
    let safeText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    // 2. Regular expression to match @username.
    const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;

    return safeText.replace(mentionRegex, (match) => {
      return `<span class="mention">${match}</span>`;
    });
  }
}
