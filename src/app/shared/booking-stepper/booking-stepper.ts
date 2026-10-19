import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-booking-stepper',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './booking-stepper.html',
  styleUrl: './booking-stepper.css'
})
export class BookingStepper {
  @Input() currentStep = 1;

  readonly steps = [
    { id: 1, label: 'Choose' },
    { id: 2, label: 'Your details' },
    { id: 3, label: 'Confirm' }
  ];
}
