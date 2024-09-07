import { Component, Inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
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
export class DialogActivitiesComponent implements OnInit {
    constructor(
        private _dialogref: MatDialogRef<DialogActivitiesComponent>,
        @Inject(MAT_DIALOG_DATA) private _data: IActivities
    ){
      this.getData.set(this._data)
      document.body.classList.add('no-scroll-no-click');
      console.log('Classe "no-scroll" adicionada ao body:', document.body.classList.contains('no-scroll-no-click'));
    }

    public getData = signal<IActivities | null>(null)

    ngOnInit(): void {

    }

    public closeModal() {
      document.body.classList.remove('no-scroll-no-click');
      console.log('Classe "no-scroll" removida do body:', document.body.classList.contains('no-scroll-no-click'));
      return this._dialogref.close()
    }
}
