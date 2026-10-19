import { registerLocaleData } from '@angular/common';
import localeHe from '@angular/common/locales/he';
import { ApplicationConfig, isDevMode, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { adminAuthInterceptor } from './services/admin-auth.interceptor';

registerLocaleData(localeHe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'he-IL' },
    // كل طلبات HttpClient تمر من interceptor الذي يضيف JWT لمسارات Admin فقط.
    // طلبات الحجز العامة لا تحتاج رمز إدارة.
    provideHttpClient(withInterceptors([adminAuthInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // المسارات lazy-loaded لتفادي تحميل صفحات Admin والحجز قبل أن يطلبها المستخدم.
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
    ),
  ],
};
