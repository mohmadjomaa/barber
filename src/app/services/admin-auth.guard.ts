import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

export const adminAuthGuard: CanActivateFn = () => {
  // يمنع فتح واجهة Admin دون جلسة صالحة في المتصفح. الخادم يكرر الحماية
  // لأن guard وحده لا يمثل طبقة أمان.
  const auth = inject(Auth);
  const router = inject(Router);

  return auth.isLoggedIn ? true : router.createUrlTree(['/admin/login']);
};

export const redirectAuthenticatedAdmin: CanActivateFn = () => {
  // يمنع أن يرى Admin صفحة تسجيل الدخول مرة أخرى ما دامت جلسته صالحة.
  const auth = inject(Auth);
  const router = inject(Router);

  return auth.isLoggedIn ? router.createUrlTree(['/admin']) : true;
};
