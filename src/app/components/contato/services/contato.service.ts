import { Injectable } from '@angular/core';
import { error } from 'console';
import emailjs from 'emailjs-com';

@Injectable({
  providedIn: 'root'
})
export class ContatoService {
  private serviceID = 'service_2z2ztf4'
  private templateID = 'template_lv55w45'
  private userID = 'q7zK78lcObZfv6oma'

  constructor() {
    emailjs.init(this.userID)
  }

  sendEmail(email: string, message: string) {
    const templateParams = {
      email,
      message
    }
    return emailjs.send(this.serviceID, this.templateID, templateParams).then((response) => {
      console.log(response)
    }).catch((error) => {
      console.log(error)
    })
  }
}
