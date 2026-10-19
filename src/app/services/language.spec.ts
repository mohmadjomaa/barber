import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language';

describe('LanguageService', () => {
  let service: LanguageService;
  let document: Document;

  beforeEach(() => {
    localStorage.removeItem('northBarberLanguage');
    TestBed.configureTestingModule({});
    service = TestBed.inject(LanguageService);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    localStorage.removeItem('northBarberLanguage');
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('defaults to English and persists a Hebrew selection with RTL document semantics', () => {
    expect(service.language()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');

    service.setLanguage('he');

    expect(service.language()).toBe('he');
    expect(localStorage.getItem('northBarberLanguage')).toBe('he');
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(service.text('Book Appointment')).toBe('קביעת תור');
  });
});
