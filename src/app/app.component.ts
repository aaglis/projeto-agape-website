import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { InicioComponent } from './components/inicio/inicio.component';
import { RedirectButtonComponent } from './shared/components/redirect-button/redirect-button.component';
import { SobreComponent } from './components/sobre/sobre.component';
import { ActivitiesComponent } from './components/activities/activities.component';
import { VoluntarioComponent } from './components/voluntario/voluntario.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    InicioComponent,
    RedirectButtonComponent,
    SobreComponent,
    ActivitiesComponent,
    VoluntarioComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
}
