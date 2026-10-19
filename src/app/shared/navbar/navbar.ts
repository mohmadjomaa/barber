import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingStateService } from '../../services/booking-state';
import { LanguageService } from '../../services/language';
import { LocalizedContentDirective } from '../localized-content.directive';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizedContentDirective],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar {
  constructor(public bookingState: BookingStateService, public language: LanguageService) {}

  get lastBooking() {
    return this.bookingState.getLastBooking();
  }

  repeatLastBooking() {
    this.bookingState.applyLastBooking();
  }

  startBooking() {
    this.bookingState.startNewBooking({ barberPreference: 'any' });
    this.bookingState.track('start_booking', { mode: 'navbar_cta' });
  }
}
