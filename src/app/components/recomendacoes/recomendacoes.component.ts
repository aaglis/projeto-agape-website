import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-recomendacoes',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './recomendacoes.component.html',
  styleUrl: './recomendacoes.component.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class RecomendacoesComponent{
  listFeedbacks = [
    {
      name: 'João da Silva',
      role: 'Voluntário do Projeto',
      feedback: 'Muito bom ver o sorisso das crianças. O projeto é incrível!',
      image: '../../../assets/recomendacoes/aglis-icon.jpg'
    },
    {
      name: 'Maria da Silva',
      role: 'Voluntária do Projeto',
      feedback: 'Muito bom ver o sorisso das crianças, o projeto é incrível!',
      image: '../../../assets/recomendacoes/aglis-icon.jpg'
    },
    {
      name: 'José da Silva',
      role: 'Voluntário do Projeto',
      feedback: 'Muito bom ver o sorisso das crianças, o projeto é incrível!',
      image: '../../../assets/recomendacoes/aglis-icon.jpg'
    },
    {
      name: 'Pedro da Silva',
      role: 'Voluntário do Projeto',
      feedback: 'Muito bom ver o sorisso das crianças, o projeto é incrível!',
      image: '../../../assets/recomendacoes/aglis-icon.jpg'
    },
    {
      name: 'Ana da Silva',
      role: 'Voluntária do Projeto',
      feedback: 'Muito bom ver o sorisso das crianças, o projeto é incrível!',
      image: '../../../assets/recomendacoes/aglis-icon.jpg'
    }
  ]

  breakpoints = {
    1400: { slidesPerView: 3 },
    1000: { slidesPerView: 2 },
    600: { slidesPerView: 1 },
    400: { slidesPerView: 1 }
  };
}
