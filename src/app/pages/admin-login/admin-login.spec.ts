import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AdminLogin } from './admin-login';
import { Auth } from '../../services/auth';
import { LanguageService } from '../../services/language';

describe('AdminLogin', () => {
  let component: AdminLogin;
  let fixture: ComponentFixture<AdminLogin>;
  let auth: { login: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.removeItem('northBarberLanguage');
    auth = { login: vi.fn(() => of({ token: 'test-token' })) };
    navigate = vi.fn(() => Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [AdminLogin],
      providers: [
        { provide: Auth, useValue: auth },
        { provide: Router, useValue: { navigate } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLogin);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('navigates to the protected dashboard after a successful password login', async () => {
    component.password = 'correct-password';
    await component.login();

    expect(auth.login).toHaveBeenCalledWith('correct-password');
    expect(navigate).toHaveBeenCalledWith(['/admin'], { replaceUrl: true });
  });

  it('shows a clear error when the password is rejected', async () => {
    auth.login.mockReturnValueOnce(throwError(() => ({ status: 401, error: { message: 'Invalid admin credentials.' } })));
    component.password = 'wrong-password';
    await component.login();

    expect(component.loginError).toBe('Invalid admin credentials.');
  });

  it('stops submitting and shows a useful message when the login API is unavailable', async () => {
    auth.login.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
    component.password = 'correct-password';

    await component.login();

    expect(component.isSubmitting).toBe(false);
    expect(component.loginError).toBe('The login service is unavailable. Please try again in a moment.');
  });

  it('updates all login labels when the language changes', () => {
    const language = TestBed.inject(LanguageService);
    const page = fixture.nativeElement as HTMLElement;

    language.setLanguage('he');
    fixture.detectChanges();

    expect(page.textContent).toContain('גישת מנהל');
    expect(page.textContent).toContain('לוח ניהול תורים');
    expect(page.querySelector('input')?.getAttribute('placeholder')).toBe('הזנת סיסמה');
    expect(page.querySelector('button')?.textContent?.trim()).toBe('כניסה ללוח הניהול');
    expect(document.documentElement.dir).toBe('rtl');

    language.setLanguage('en');
    fixture.detectChanges();

    expect(page.textContent).toContain('Admin access');
    expect(page.querySelector('input')?.getAttribute('placeholder')).toBe('Enter Password');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
