import { Component } from '@angular/core';
import { HighlightPanelComponent } from './components/highlight-panel/highlight-panel.component';

@Component({
  selector: 'app-sobre',
  standalone: true,
  imports: [HighlightPanelComponent],
  templateUrl: './sobre.component.html',
  styleUrl: './sobre.component.scss'
})
export class SobreComponent {

}
