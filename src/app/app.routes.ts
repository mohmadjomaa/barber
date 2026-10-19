import { Routes } from '@angular/router';
import { adminAuthGuard, redirectAuthenticatedAdmin } from './services/admin-auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'services',
    // تبدأ رحلة العميل هنا: اختيار الخدمة ثم التاريخ والوقت ثم التأكيد.
    loadComponent: () => import('./pages/services/services').then((m) => m.Services),
  },
  // هذه الروابط القديمة تبقى متوافقة مع الروابط المحفوظة، لكن تستخدم تدفق الحجز الموحد.
  { path: 'barbers', redirectTo: '/services', pathMatch: 'full' },
  { path: 'booking', redirectTo: '/services', pathMatch: 'full' },
  { path: 'customer-info', redirectTo: '/services', pathMatch: 'full' },
  {
    path: 'success',
    loadComponent: () => import('./pages/success/success').then((m) => m.Success),
  },
  { path: 'dashboard', redirectTo: '/admin', pathMatch: 'full' },
  {
    path: 'admin/login',
    // لا نعرض نموذج الدخول مجدداً إذا كانت جلسة Admin في المتصفح ما زالت صالحة.
    canActivate: [redirectAuthenticatedAdmin],
    loadComponent: () => import('./pages/admin-login/admin-login').then((m) => m.AdminLogin),
  },
  {
    path: 'admin',
    pathMatch: 'full',
    // الحارس يمنع فتح الواجهة الإدارية محلياً؛ أما التحقق الحاسم من JWT فيتم بالخادم.
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
  },
  {
    path: 'admin/bookings',
    // نستخدم الحارس نفسه الخاص باللوحة؛ لا يفتح المسار عند كتابته يدويًا بدون جلسة Admin.
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./pages/admin-bookings/admin-bookings').then((m) => m.AdminBookings),
  },
  { path: '**', redirectTo: '' },
];
