import { Component, signal, inject } from '@angular/core';
import { IActivities } from '../../interface/IActivities.interface';
import { RedirectButtonComponent } from '../../shared/components/redirect-button/redirect-button.component';
import { MatDialog } from '@angular/material/dialog';
import { DialogActivitiesComponent } from '../dialog/dialog-activities/dialog-activities.component';
import { EDialogPanelCLass } from '../../enum/EDialogPanelClass.enum';
@Component({
  selector: 'app-activities',
  standalone: true,
  imports: [RedirectButtonComponent],
  templateUrl: './activities.component.html',
  styleUrl: './activities.component.scss'
})
export class ActivitiesComponent {
  #dialog = inject(MatDialog);

  public arrayActivities = signal<(IActivities[])>([
    {
      srcMain: 'assets/nossas-atividades/dia-das-criancas/principal.png',
      alt: 'imagem tirada no dia das crianças',
      title: 'Dia das Crianças',
      imagesCarousel: [
        'assets/nossas-atividades/dia-das-criancas/principal.png',
        'assets/nossas-atividades/dia-das-criancas/pintura-de-rosto.png',
        'assets/nossas-atividades/dia-das-criancas/futebol-de-sabao.png',
      ],
      description: {
        text: 'No Dia das Crianças, proporcionamos um dia completo de diversão e alegria para os pequenos. Oferecemos atividades como pintura de rosto, pintura de gesso, piscina de bolinhas para os menores, pula-pula, guerra de cotonetes, futebol de sabão e muito mais. Cada criança também recebe uma lembrancinha especial para levar para casa, tornando o dia inesquecível.',
        operatingDay: 'entre o mês de outubro',
      },
      link: {
        name: 'mais informações no nosso instagram',
        href: 'https://www.instagram.com/projetoagape19/'
      }
    },
    {
      srcMain: 'assets/nossas-atividades/natal/danca.png',
      alt: 'imagem tirada no dia do natal',
      title: 'Natal',
      imagesCarousel: [
        'assets/nossas-atividades/natal/danca.png',
        'assets/nossas-atividades/natal/ceia.png',
        'assets/nossas-atividades/natal/peca-teatral.png',
      ],
      description: {
        text: 'No Natal, focamos tanto nas crianças quanto em seus pais. Celebramos com uma peça teatral sobre o nascimento de Jesus, seguida de brincadeiras para as crianças. Ao final, todos participam de uma ceia especial, com comida deliciosa para as crianças e seus pais, promovendo um verdadeiro espírito de união e celebração.',
        operatingDay: 'entre o mês de dezembro',
      },
      link: {
        name: 'mais informações no nosso instagram',
        href: 'https://www.instagram.com/projetoagape19/'
      }
    },
    {
      srcMain: 'assets/nossas-atividades/segundas-feiras/principal.jpg',
      alt: 'imagem tirada nos encontros às segundas-feiras',
      title: 'Segunda do Projeto',
      imagesCarousel: [
        'assets/nossas-atividades/segundas-feiras/principal.jpg',
        'assets/nossas-atividades/natal/ceia.png',
        'assets/nossas-atividades/natal/peca-teatral.png',
      ],
      description: {
        text: 'A cada segunda-feira, realizamos atividades variadas com as crianças. Promovemos brincadeiras divertidas e rodas de conversa para saber como foi a semana de cada uma delas. No final, oferecemos um pequeno lanche, criando um momento de partilha e convivência que fortalece nossos laços com a comunidade.',
        operatingDay: 'todas as segundas-feiras (sujeito a mudanças).',
      },
      link: {
        name: 'mais informações no nosso instagram',
        href: 'https://www.instagram.com/projetoagape19/'
      }
    }
  ])

  public openDialog(data: IActivities) {
    this.#dialog.open(DialogActivitiesComponent, {
      data,
      panelClass: EDialogPanelCLass.PROJECTS
    })
  }
}
