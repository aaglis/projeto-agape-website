import { NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, Inject, PLATFORM_ID, ViewChild, AfterViewInit} from '@angular/core';
import { RedirectButtonComponent } from '../../shared/components/redirect-button/redirect-button.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [NgOptimizedImage, RedirectButtonComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements AfterViewInit {
  @ViewChild('toggleBtn') toggleBtn!: ElementRef;
  @ViewChild('toggleBtnIcon') toggleBtnIcon!: ElementRef;
  @ViewChild('dropdownMenu') dropdownMenu!: ElementRef;
  urlMainLogo: string = '../../../assets/logo-principal.png';
  iconMenu: string = '../../../assets/menu-icon.svg';

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.toggleBtn.nativeElement.addEventListener('click', (event: Event) => {
        event.stopPropagation();

        if (!this.dropdownMenu.nativeElement.classList.contains('open')) {
          this.iconMenu = '../../../assets/close-icon.svg';
        } else {
          this.iconMenu = '../../../assets/menu-icon.svg';
        }

        this.dropdownMenu.nativeElement.classList.toggle('open');
      });

      document.addEventListener('click', () => {
        this.dropdownMenu.nativeElement.classList.remove('open');
        this.iconMenu = '../../../assets/menu-icon.svg';
      });
    }
  }
}
