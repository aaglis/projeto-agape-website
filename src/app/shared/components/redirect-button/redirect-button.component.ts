import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-redirect-button',
  standalone: true,
  imports: [],
  templateUrl: './redirect-button.component.html',
  styleUrl: './redirect-button.component.scss'
})
export class RedirectButtonComponent {
  @Input() locale: string = ""
  @Input() text: string = ""
}
