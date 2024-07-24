import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { register as RegisterSwiperElements } from 'swiper/element/bundle';
import { AppComponent } from './app/app.component';

RegisterSwiperElements();
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
