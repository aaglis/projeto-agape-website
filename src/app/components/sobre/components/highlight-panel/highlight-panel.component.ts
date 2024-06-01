import { NgOptimizedImage } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-highlight-panel',
  standalone: true,
  imports: [NgOptimizedImage],
  templateUrl: './highlight-panel.component.html',
  styleUrl: './highlight-panel.component.scss'
})
export class HighlightPanelComponent {
  @Input() imageUrl: string = ''
  @Input() preTitle: string = ''
  @Input() title: string = ''
  @Input() subtext: string = ''
  @Input() imagePosition: string = ''
}
