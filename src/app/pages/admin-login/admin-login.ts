import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { getApiErrorMessage } from '../../services/api-error';
import { Auth } from '../../services/auth';
import { LanguageService } from '../../services/language';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.css'
})
export class AdminLogin {
  private auth = inject(Auth);
  private router = inject(Router);
  private language = inject(LanguageService);
  private changeDetector = inject(ChangeDetectorRef);

  password = '';
  loginError = '';
  isSubmitting = false;

  text(value: string) {
    return this.language.text(value);
  }

  login() {
    if (this.isSubmitting) {
      return;
    }

    this.loginError = '';
    if (!this.password) {
      this.loginError = 'Enter the admin password.';
      return;
    }

    this.isSubmitting = true;
    this.auth.login(this.password).subscribe({
      next: () => {
        this.password = '';
        void this.router.navigate(['/admin'], { replaceUrl: true }).then(
          () => {
            this.isSubmitting = false;
            this.changeDetector.markForCheck();
          },
          (error) => {
            this.loginError = getApiErrorMessage(error, 'Unable to open the admin dashboard.');
            this.isSubmitting = false;
            this.changeDetector.markForCheck();
          },
        );
      },
      error: (error) => {
        this.loginError =
          error instanceof HttpErrorResponse && error.status >= 500
            ? 'The login service is unavailable. Please try again in a moment.'
            : getApiErrorMessage(error, 'Invalid admin credentials.');
        this.password = '';
        this.isSubmitting = false;
        this.changeDetector.markForCheck();
      },
    });
  }
}
