import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RedirectButtonComponent } from '../../shared/components/redirect-button/redirect-button.component';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [NgOptimizedImage, RedirectButtonComponent],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.scss'
})
export class InicioComponent {

  coracaoIcon: string = '../../../assets/coracao-icone.png'
  criancasImg: string = '../../../assets/criancas-projeto.jpeg'


}
