import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiErrorMessage } from '../../services/api-error';
import { Auth } from '../../services/auth';
import {
  BookingListFilter,
  BookingSortKey,
  compareBookingsByDate,
  filterBookings,
} from '../../services/booking-list';
import { BookingApiService } from '../../services/booking-api';
import { BookingRecord, BookingStateService } from '../../services/booking-state';

@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-bookings.html',
  styleUrl: './admin-bookings.css',
})
export class AdminBookings implements OnInit {
  private bookingApi = inject(BookingApiService);
  private bookingState = inject(BookingStateService);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private auth = inject(Auth);
  private router = inject(Router);

  bookings: BookingRecord[] = [];
  searchText = '';
  filter: BookingListFilter = 'upcoming';
  sortKey: BookingSortKey = 'date';
  sortDirection: 'asc' | 'desc' = 'asc';
  page = 1;
  readonly pageSize = 10;
  isLoading = true;
  isDeletingBookingId: string | null = null;
  actionMessage = '';
  actionError = '';

  ngOnInit() {
    void this.loadBookings();
  }

  get filteredBookings() {
    const results = filterBookings(this.bookings, this.filter, this.searchText);
    return [...results].sort((first, second) => this.compareBookings(first, second));
  }

  get pageCount() {
    return Math.max(1, Math.ceil(this.filteredBookings.length / this.pageSize));
  }

  get pageBookings() {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredBookings.slice(start, start + this.pageSize);
  }

  get rangeStart() {
    return this.filteredBookings.length ? (this.page - 1) * this.pageSize + 1 : 0;
  }

  get rangeEnd() {
    return Math.min(this.page * this.pageSize, this.filteredBookings.length);
  }

  get visiblePages() {
    const first = Math.max(1, this.page - 2);
    const last = Math.min(this.pageCount, first + 4);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }

  async loadBookings() {
    this.isLoading = true;
    this.actionError = '';
    try {
      const bookings = await firstValueFrom(this.bookingApi.getAdminBookings());
      this.bookings = bookings;
      this.bookingState.setBookings(bookings);
      this.ensureValidPage();
    } catch (error) {
      if (this.isAuthenticationError(error)) {
        this.auth.logout();
        await this.router.navigate(['/admin/login'], { replaceUrl: true });
        return;
      }
      this.actionError = getApiErrorMessage(error, 'Could not load bookings.');
    } finally {
      this.isLoading = false;
      this.changeDetectorRef.markForCheck();
    }
  }

  setFilter(filter: BookingListFilter) {
    this.filter = filter;
    this.page = 1;
  }

  updateSearch() {
    this.page = 1;
  }

  sortBy(key: BookingSortKey) {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = 'asc';
    }
    this.page = 1;
  }

  goToPage(page: number) {
    this.page = Math.min(Math.max(1, page), this.pageCount);
  }

  formatTime(time: string) {
    return this.bookingState.formatTime(time);
  }

  async cancelBooking(booking: BookingRecord) {
    if (this.isDeletingBookingId || !window.confirm(`Cancel booking for ${booking.name}?`)) {
      return;
    }

    this.actionMessage = '';
    this.actionError = '';
    this.isDeletingBookingId = booking.id;
    try {
      await firstValueFrom(this.bookingApi.deleteAdminBooking(booking.id));
      await this.loadBookings();
      this.actionMessage = `Booking for ${booking.name} was cancelled.`;
      this.changeDetectorRef.markForCheck();
    } catch (error) {
      if (this.isAuthenticationError(error)) {
        this.auth.logout();
        await this.router.navigate(['/admin/login'], { replaceUrl: true });
        return;
      }
      this.actionError = getApiErrorMessage(error, 'Could not cancel booking. Please try again.');
    } finally {
      this.isDeletingBookingId = null;
      this.changeDetectorRef.markForCheck();
    }
  }

  private compareBookings(first: BookingRecord, second: BookingRecord) {
    let comparison = 0;
    if (this.sortKey === 'date') {
      comparison = compareBookingsByDate(first, second);
    } else {
      const field = this.sortKey === 'customer' ? 'name' : this.sortKey;
      comparison = first[field].localeCompare(second[field]);
    }
    return this.sortDirection === 'asc' ? comparison : -comparison;
  }

  private ensureValidPage() {
    this.page = Math.min(this.page, this.pageCount);
  }

  private isAuthenticationError(error: unknown) {
    return !!error && typeof error === 'object' && 'status' in error &&
      ((error as { status?: number }).status === 401 || (error as { status?: number }).status === 403);
  }
}
