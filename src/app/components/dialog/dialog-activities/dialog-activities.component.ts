import { AfterViewInit, Component, ElementRef, Inject, OnInit, signal, ViewChild, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IActivities } from '../../../interface/IActivities.interface';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-dialog-activities',
    standalone: true,
    imports: [MatDialogModule, CommonModule],
    templateUrl: './dialog-activities.component.html',
    styleUrl: './dialog-activities.component.scss',
    encapsulation: ViewEncapsulation.Emulated
})
export class DialogActivitiesComponent implements OnInit, AfterViewInit {
    constructor(
        private _dialogref: MatDialogRef<DialogActivitiesComponent>,
        @Inject(MAT_DIALOG_DATA) private _data: IActivities
    ){}

    public getData = signal<IActivities | null>(null)

    ngOnInit(): void {
        this.getData.set(this._data)
    }

    public closeModal() {
        return this._dialogref.close()
    }

    @ViewChild('carousel') carousel!: ElementRef;

    async ngAfterViewInit(): Promise<void> {
        if (typeof window !== 'undefined') {
            const { Carousel } = await import('bootstrap');
            const carouselElement = this.carousel.nativeElement;
            new Carousel(carouselElement, {
                interval: 4000,
                ride: 'carousel'
            });
        }
    }
}
