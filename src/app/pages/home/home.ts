import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BookingApiService } from '../../services/booking-api';
import { BookingRecord, BookingStateService } from '../../services/booking-state';
import { LanguageService } from '../../services/language';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit {
  private bookingState = inject(BookingStateService);
  private bookingApi = inject(BookingApiService);
  private language = inject(LanguageService);
  private changeDetectorRef = inject(ChangeDetectorRef);
  services = this.bookingState.services;
  barbers = this.bookingState.barbers;
  lastBooking = this.bookingState.getLastBooking();
  recommendedService = this.bookingState.services[0];
  nextSlot = { date: '', time: '' };
  serviceNextSlots: Record<string, { date: string; time: string }> = {};
  confirmationBooking = (history.state?.['confirmedBooking'] as BookingRecord | undefined) || null;

  async ngOnInit() {
    try {
      const [services, barbers] = await Promise.all([
        firstValueFrom(this.bookingApi.getServices()),
        firstValueFrom(this.bookingApi.getBarbers()),
      ]);
      this.bookingState.setServices(services);
      this.bookingState.setBarbers(barbers);
      this.services = this.bookingState.services;
      this.barbers = this.bookingState.barbers;
      this.recommendedService = this.services[0] || this.recommendedService;
      this.changeDetectorRef.markForCheck();
      await Promise.all(this.services.map(async (service) => {
        try {
          const dates = await firstValueFrom(this.bookingApi.getAvailabilityDates({
            days: 14, serviceId: service.id, barberPreference: 'any',
          }));
          // A date can fill up between requests. Continue to the next available day.
          for (const date of dates.filter((date) => !date.closed && date.hasSlots !== false)) {
            const groups = await firstValueFrom(this.bookingApi.getAvailabilitySlots({
              date: date.iso, serviceId: service.id, barberId: null, barberPreference: 'any',
            }));
            const slot = groups.flatMap((group) => group.slots).find((slot) => !slot.disabled);
            if (slot) {
              this.serviceNextSlots = {
                ...this.serviceNextSlots, [service.id]: { date: date.iso, time: slot.time },
              };
              const available = Object.values(this.serviceNextSlots).sort((a, b) =>
                a.date.localeCompare(b.date) ||
                this.bookingState.formatTime(a.time).localeCompare(this.bookingState.formatTime(b.time)),
              );
              this.nextSlot = available[0];
              this.changeDetectorRef.markForCheck();
              break;
            }
          }
        } catch {
          // A failed preview should not prevent booking another service.
        }
      }));
    } catch {}
  }

  startBooking(serviceId?: string) {
    this.bookingState.startNewBooking({
      barberPreference: 'any',
      ...(serviceId ? { serviceId } : {})
    });
    this.bookingState.track('start_booking', { mode: serviceId ? 'service_preview' : 'hero_cta', serviceId: serviceId || null });
  }

  repeatLastBooking() {
    this.bookingState.applyLastBooking();
  }

  get previewServices() {
    return this.services.slice(0, 3);
  }

  get lastBookingLabel() {
    return this.lastBooking
      ? `${this.lastBooking.service} ${this.t('with')} ${this.lastBooking.barber}`
      : '';
  }

  get formattedNextSlot() {
    return this.bookingState.formatDate(this.nextSlot.date);
  }

  get formattedNextTime() {
    return this.bookingState.formatTime(this.nextSlot.time);
  }

  serviceNextSlotLabel(serviceId: string) {
    const slot = this.serviceNextSlots[serviceId];
    return slot
      ? `${this.bookingState.formatDate(slot.date)} ${this.t('at')} ${this.bookingState.formatTime(slot.time)}`
      : '';
  }

  get confirmationMessage() {
    if (!this.confirmationBooking) {
      return '';
    }

    return `${this.confirmationBooking.service} ${this.t('with')} ${this.confirmationBooking.barber} · ${this.bookingState.formatDate(this.confirmationBooking.date)} ${this.t('at')} ${this.bookingState.formatTime(this.confirmationBooking.time)}`;
  }

  private t(value: string) {
    return this.language.text(value);
  }
}
