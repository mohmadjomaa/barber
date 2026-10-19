import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-time-slot',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './time-slot.html',
  styleUrl: './time-slot.css'
})
export class TimeSlot {
  @Input() label = '';
  @Input() selected = false;
  @Input() accent = '';
  @Input() disabled = false;
  @Output() picked = new EventEmitter<void>();
}
