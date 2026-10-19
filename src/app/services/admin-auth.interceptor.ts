import { HttpInterceptorFn } from '@angular/common/http';

export const adminAuthInterceptor: HttpInterceptorFn = (req, next) => {
  // نضيف Bearer token للـ Admin API فقط، حتى لا نرسل بيانات صلاحيات
  // بلا حاجة مع مسارات العميل العامة.
  const token = sessionStorage.getItem('adminToken');

  if (!token || !/(^|\/\/[^/]+)\/api\/admin(?:\/|$)/.test(req.url)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
};
