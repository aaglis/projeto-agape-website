import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-voluntario',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './voluntario.component.html',
  styleUrl: './voluntario.component.scss'
})
export class VoluntarioComponent {

  volunteerBenefits = [
    {
      title: 'Apoie Nossas Crianças',
      icon: '../../../assets/icons/lines/cloud.svg',
      description: 'Ajude a proporcionar momentos de alegria, aprendizado e apoio emocional para cada criança da nossa comunidade, promovendo um ambiente seguro e acolhedor para seu desenvolvimento.'
    },
    {
      title: 'Fortaleça a Comunidade',
      icon: '../../../assets/icons/lines/positive.svg',
      description: 'Participe ativamente na construção de uma comunidade mais forte e coesa, onde cada ação voluntária contribui para um ambiente mais solidário e inclusivo.'
    },
    {
      title: 'Veja os Frutos',
      icon: '../../../assets/icons/lines/star.svg',
      description: 'Testemunhe o impacto positivo do seu trabalho voluntário, observando as crianças crescerem confiantes e felizes, e a comunidade se tornar mais unida e resiliente.'
    }
  ]

}
