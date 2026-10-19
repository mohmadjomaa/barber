import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  constructor(private http: HttpClient) {}

  get token() {
    return sessionStorage.getItem('adminToken');
  }

  get isLoggedIn() {
    // هذا فحص سريع في المتصفح لتوجيه الصفحات فقط. التحقق الأمني الحقيقي
    // من توقيع JWT والدور يحدث في middleware الخادم لكل /api/admin طلب.
    const token = this.token;

    if (!token) {
      return false;
    }

    try {
      const encodedPayload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = encodedPayload.padEnd(
        encodedPayload.length + ((4 - (encodedPayload.length % 4)) % 4),
        '=',
      );
      const payload = JSON.parse(atob(paddedPayload));
      return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  login(password: string) {
    // POST /api/auth/login يعيد JWT قصير العمر. نحفظه في sessionStorage
    // حتى تنتهي جلسة التبويب؛ لا نحفظ كلمة المرور نفسها مطلقًا.
    return this.http.post<{ token: string }>('/api/auth/login', { password }).pipe(
      tap((response) => {
        if (!response.token) {
          throw new Error('The login response did not include an admin token.');
        }

        sessionStorage.setItem('adminToken', response.token);
      }),
    );
  }

  logout() {
    // إزالة JWT تكفي لإنهاء صلاحية الواجهة؛ الطلبات الإدارية التالية سترفض.
    sessionStorage.removeItem('adminToken');
  }
}
