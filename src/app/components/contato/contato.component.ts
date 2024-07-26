import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { ContatoService } from './services/contato.service';
import { LucideAngularModule } from 'lucide-angular';
import Swal from 'sweetalert2';

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

  @ViewChild('buttonSubmit') buttonSubmit?: ElementRef;

  onSubmit(event: Event) {
    event.preventDefault()
    this.buttonSubmit?.nativeElement.setAttribute('disabled', 'true');

    let email = (document.querySelector('#email') as HTMLInputElement).value;
    let message = (document.querySelector('#message') as HTMLTextAreaElement).value;

    this.contatoService.sendEmail(email, message).then(() => {
      this.successMessage = 'Mensagem enviada com sucesso!';
      console.log(this.successMessage)
      Swal.fire({
        position: "top-end",

        icon: "success",
        title: "Your work has been saved",
        showConfirmButton: false,
        showCloseButton: true,
        timer: 3000,
        timerProgressBar: true,
      });
      email = ''
      message = ''

      setTimeout(() => {
        this.buttonSubmit?.nativeElement.removeAttribute('disabled');
      }, 100000)
    }).catch(() => {
      this.errorMessage = 'Houve um erro ao enviar a mensagem.';
      console.log(this.errorMessage)
      Swal.fire({
        position: "top-end",

        icon: "error",
        title: "Erro ao enviar a mensagem. Tente novamente.",
        showConfirmButton: true,
        showCloseButton: true,
        timer: 3000,
        timerProgressBar: true,
      });
    });
  }
}
