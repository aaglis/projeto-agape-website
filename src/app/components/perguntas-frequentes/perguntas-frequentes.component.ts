import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, ViewChildren } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-perguntas-frequentes',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './perguntas-frequentes.component.html',
  styleUrl: './perguntas-frequentes.component.scss'
})
export class PerguntasFrequentesComponent implements AfterViewInit {
  faqList = [
    {
      question: 'Que dia acontece as programações?',
      answer: 'Toda segunda-feira à partir das 19:30',
      activated: true
    },
    {
      question: 'Com qual idade pode participar do Projeto?',
      answer: 'Temos crianças de todas a idades atingindo até a adolescência.',
      activated: false
    },
    {
      question: 'Como é feito o controle das crianças?',
      answer: 'Fazemos um breve cadastro durante a programação com os dados básicos da criança e do responsável, para garantir a segurança de todos.',
      activated: false
    },
    {
      question: 'Como faço para obter informações sobre as programações?',
      answer: 'Acompanhando o nosso Instagram e participando do grupo de responsáveis no WhatsApp logo após o cadastro da criança.',
      activated: false
    }
  ]

  @ViewChildren('faqItem') faqItems?: ElementRef[];

  ngAfterViewInit() {
    this.faqItems?.forEach((item) => {
      item.nativeElement.addEventListener('click', () => {
        this.showDetails(item);
      })
    })
  }

  showDetails(item: ElementRef) {
      item.nativeElement.classList.toggle('ativo');
  }
}
