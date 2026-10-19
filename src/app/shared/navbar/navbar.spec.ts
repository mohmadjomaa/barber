import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Navbar } from './navbar';

describe('Navbar', () => {
  let component: Navbar;
  let fixture: ComponentFixture<Navbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(Navbar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps Book Appointment as the only navbar booking entry point', () => {
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const links = Array.from(element.querySelectorAll('a'))
      .map(link => link.textContent?.trim());

    expect(element.querySelector('.nav-links')).toBeNull();
    expect(links).not.toContain('Book');
    expect(links).toContain('Book Appointment');
    expect(element.querySelector('.nav-cta')?.getAttribute('href')).toBe('/services');
  });
});
