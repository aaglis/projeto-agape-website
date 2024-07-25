import { Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ContatoService } from './services/contato.service';

@Component({
  selector: 'app-contato',
  standalone: true,
  imports: [ LucideAngularModule],
  templateUrl: './contato.component.html',
  styleUrl: './contato.component.scss'
})
export class ContatoComponent {
  successMessage: string | null = null;
  errorMessage: string | null = null;

  private contatoService = inject(ContatoService)

  onSubmit(event: Event) {
    event.preventDefault()
    const email = (document.querySelector('#email') as HTMLInputElement).value;
    const message = (document.querySelector('#message') as HTMLTextAreaElement).value;

    this.contatoService.sendEmail(email, message).then(() => {
      this.successMessage = 'Mensagem enviada com sucesso!';
      console.log(this.successMessage)
    }).catch(() => {
      this.errorMessage = 'Houve um erro ao enviar a mensagem.';
      console.log(this.errorMessage)
    });
  }
}
