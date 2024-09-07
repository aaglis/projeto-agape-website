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
      name: 'Dalva',
      role: 'Voluntária do Projeto',
      feedback: 'Desde 2019 fazendo a diferença na vida da minha família. Muito mais que um projeto! É uma família 🧡 Minhas segundas nunca mais foram as mesma des de que conheci o Projeto Ágape 😊',
      image: '../../../assets/recomendacoes/dalva.jpeg'
    },
    {
      name: 'Rayane Guemes',
      role: 'Coordenadora do Projeto',
      feedback: 'Como eu amo fazer parte desse Projeto. 🧡 Cada abraço recebido de uma criança na segunda renova minha esperança!',
      image: '../../../assets/recomendacoes/rayanne.jpeg'
    },
    {
      name: 'Anna Ellen',
      role: 'Voluntária do Projeto',
      feedback: 'Amo ser voluntária, nada paga ver o sorriso de cada uma das crianças e elas mudam nossas segundas feiras também. O Senhor nos deu o projeto e parte da nossa missão é em cada detalhe mostrar o cuidado e amor dEle!',
      image: '../../../assets/recomendacoes/ellen.jpeg'
    },
    {
      name: 'Eduarda',
      role: 'Voluntária do Projeto',
      feedback: 'Participar deste projeto me enche de alegria e propósito.',
      image: '../../../assets/recomendacoes/eduarda.jpeg'
    },
    {
      name: 'Janaynna Henrique',
      role: 'Coordenadora do Projeto',
      feedback: 'O projeto ágape é incrível!!! O que mais me motiva a fazer parte é ver o cuidado e a transformação que Deus tem feito na vida das crianças e das suas famílias ❤‍🔥',
      image: '../../../assets/recomendacoes/janaina.jpeg'
    },
    {
      name: 'Stefane Sales',
      role: 'Voluntária do Projeto',
      feedback: 'sou extremamente feliz em fazer parte dessa família. Trabalhar com crianças é muito desafiador, mas também é extremamente gratificante ver os frutos desse empenho, principalmente para o Reino de Deus! Sou suspeita em falar, amo a tropa do P.A 😍',
      image: '../../../assets/recomendacoes/stefane.jpeg'
    },
    {
      name: 'Kauã',
      role: 'Voluntário do Projeto',
      feedback: 'Estou honrado em contribuir para a construção da fé nas novas gerações.',
      image: '../../../assets/recomendacoes/kaua.jpeg'
    },
  ]

  breakpoints = {
    1400: { slidesPerView: 3 },
    1000: { slidesPerView: 2 },
    600: { slidesPerView: 1 },
    400: { slidesPerView: 1 },
    200: { slidesPerView: 1 }
  };
}
