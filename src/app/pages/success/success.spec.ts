import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Success } from './success';
import { BookingApiService } from '../../services/booking-api';

describe('Success', () => {
  let fixture: ComponentFixture<Success>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Success],
      providers: [provideRouter([]), { provide: BookingApiService, useValue: { getBooking: () => of(null), deleteBooking: () => of(undefined) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(Success);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('renders the safe empty state without a customer management token', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No active booking is selected.');
  });
});
