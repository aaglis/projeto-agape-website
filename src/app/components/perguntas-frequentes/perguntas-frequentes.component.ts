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
      question: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?',
      answer: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam nec purus nec nunc tincidunt aliquam. Nullam nec purus nec nunc tincidunt aliquam.',
      activated: true
    },
    {
      question: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?',
      answer: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam nec purus nec nunc tincidunt aliquam. Nullam nec purus nec nunc tincidunt aliquam.',
      activated: false
    },
    {
      question: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?',
      answer: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam nec purus nec nunc tincidunt aliquam. Nullam nec purus nec nunc tincidunt aliquam.',
      activated: false
    },
    {
      question: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?',
      answer: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam nec purus nec nunc tincidunt aliquam. Nullam nec purus nec nunc tincidunt aliquam.',
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
