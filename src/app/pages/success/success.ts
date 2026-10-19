import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiErrorMessage } from '../../services/api-error';
import { BookingApiService } from '../../services/booking-api';
import { BookingStateService } from '../../services/booking-state';
import { LanguageService } from '../../services/language';

@Component({
  selector: 'app-success',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './success.html',
  styleUrl: './success.css'
})
export class Success implements OnInit, OnDestroy {
  private bookingState = inject(BookingStateService);
  private bookingApi = inject(BookingApiService);
  private language = inject(LanguageService);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private router = inject(Router);
  private redirectTimer: ReturnType<typeof setTimeout> | null = null;
  booking: import('../../services/booking-state').BookingRecord | null = null;
  deletedMessage = '';
  secondsUntilHome = 5;

  async ngOnInit() {
    const lastBookingId = this.bookingState.getLastBookingId();

    if (!lastBookingId) {
      return;
    }

    const token = this.bookingState.getBookingToken(lastBookingId);

    if (!token) {
      this.booking = null;
      return;
    }

    try {
      this.booking = await firstValueFrom(this.bookingApi.getBooking(lastBookingId, token));
      this.bookingState.setBookings([this.booking]);
    } catch {
      this.booking = null;
    }

    this.changeDetectorRef.markForCheck();

    if (this.booking) {
      this.redirectTimer = setTimeout(() => this.router.navigate(['/']), this.secondsUntilHome * 1000);
    }
  }

  ngOnDestroy() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
    }
  }

  get formattedDate() {
    return this.booking ? this.bookingState.formatDate(this.booking.date) : '';
  }

  get formattedTime() {
    return this.booking ? this.bookingState.formatTime(this.booking.time) : '';
  }

  get reminderLabel() {
    const method = this.booking?.reminderPreference || 'sms';
    const label = method === 'whatsapp' ? 'WhatsApp' : method === 'email' ? 'email' : 'SMS';
    if (this.language.language() === 'he') {
      const hebrewLabel = method === 'email' ? 'דוא״ל' : label;
      return `תזכורת ב־${hebrewLabel} מתוזמנת 24 שעות מראש.`;
    }

    return `${label} reminder scheduled 24 hours before.`;
  }

  get bookingLead() {
    if (!this.booking) {
      return '';
    }

    return this.language.language() === 'he'
      ? `הכול מוכן, ${this.booking.name}. התור שלך עבור ${this.booking.service} אצל ${this.booking.barber} נקבע ל־${this.formattedDate} בשעה ${this.formattedTime}.`
      : `You’re all set, ${this.booking.name}. Your ${this.booking.service} with ${this.booking.barber} is booked for ${this.formattedDate} at ${this.formattedTime}.`;
  }

  get reminderAndPaymentLabel() {
    return this.language.language() === 'he'
      ? `${this.reminderLabel} התשלום במספרה. התקשרו אלינו אם צריך לשנות את התור.`
      : `${this.reminderLabel} Pay in shop. Call us if you need to make a change.`;
  }

  repeatLastBooking() {
    this.bookingState.applyLastBooking();
  }

  async deleteBooking() {
    if (!this.booking) {
      return;
    }

    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
      this.redirectTimer = null;
    }

    if (!window.confirm(this.language.text('Delete this booking? This action cannot be undone.'))) {
      return;
    }

    const bookingId = this.booking.id;
    const token = this.bookingState.getBookingToken(bookingId);

    try {
      await firstValueFrom(this.bookingApi.deleteBooking(bookingId, token));
      this.bookingState.clearBookingReference(bookingId);
      this.booking = null;
      this.deletedMessage = this.language.text('Your booking has been deleted.');
    } catch (error) {
      this.deletedMessage = this.language.text(
        getApiErrorMessage(error, 'We could not delete this booking. Please call the shop.'),
      );
    }
  }
}
