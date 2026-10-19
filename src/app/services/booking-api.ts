import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { timeout } from 'rxjs';
import {
  AdminBookingDraft,
  AvailabilityDateOption,
  BarberOption,
  BookingDraft,
  BookingRecord,
  ServiceOption,
  ShopSchedule,
  TimeSlotGroup,
} from './booking-state';

export interface BookingResponse {
  booking: BookingRecord;
  manageToken: string;
  sms?: {
    status: 'sent' | 'skipped' | 'failed';
    reason?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class BookingApiService {
  // هذه الخدمة هي نقطة العبور الوحيدة من Angular إلى API. لا تحفظ الحجوزات
  // محليًا؛ الخادم وMongoDB هما مصدر الحقيقة للحجز والساعات المتاحة.
  private http = inject(HttpClient);
  private readonly apiUrl = '/api';
  private readonly requestTimeoutMs = 10_000;

  getServices() {
    // GET /api/services: يعيد الخدمات المفعلة فقط التي يمكن للعميل حجزها.
    return this.http
      .get<ServiceOption[]>(`${this.apiUrl}/services`)
      .pipe(timeout(this.requestTimeoutMs));
  }

  getBarbers(serviceId?: string | null) {
    // عند تمرير serviceId يعيد الخادم الحلاقين المتوافقين مع الخدمة،
    // حتى لا تعرض الواجهة حلاقًا لا يستطيع تنفيذها.
    let params = new HttpParams();
    if (serviceId) {
      params = params.set('serviceId', serviceId);
    }

    return this.http
      .get<BarberOption[]>(`${this.apiUrl}/barbers`, { params })
      .pipe(timeout(this.requestTimeoutMs));
  }

  getAvailabilityDates(
    input:
      | number
      | {
          days?: number;
          serviceId?: string | null;
          barberId?: string | null;
          barberPreference?: BookingDraft['barberPreference'];
        } = 7,
  ) {
    // GET /api/availability/dates: يبني شريط الأيام من ساعات العمل
    // والحجوزات الفعلية، وليس من بيانات localStorage في المتصفح.
    const options = typeof input === 'number' ? { days: input } : input;
    let params = new HttpParams().set('days', options.days ?? 7);

    if (options.serviceId) {
      params = params.set('serviceId', options.serviceId);
    }

    if (options.barberId) {
      params = params.set('barberId', options.barberId);
    }

    if (options.barberPreference) {
      params = params.set('barberPreference', options.barberPreference);
    }

    return this.http
      .get<AvailabilityDateOption[]>(`${this.apiUrl}/availability/dates`, { params })
      .pipe(timeout(this.requestTimeoutMs));
  }

  getAvailabilitySlots(params: {
    date: string;
    serviceId: string | null;
    barberId: string | null;
    barberPreference: BookingDraft['barberPreference'];
  }) {
    // GET /api/availability/slots: date جزء أساسي من الطلب؛ لا يصح إعادة
    // استخدام ساعات يوم آخر حتى لو كان الوقت النصي متطابقًا.
    let httpParams = new HttpParams()
      .set('date', params.date || '')
      .set('barberPreference', params.barberPreference);

    if (params.serviceId) {
      httpParams = httpParams.set('serviceId', params.serviceId);
    }

    if (params.barberId) {
      httpParams = httpParams.set('barberId', params.barberId);
    }

    return this.http
      .get<TimeSlotGroup[]>(`${this.apiUrl}/availability/slots`, { params: httpParams })
      .pipe(timeout(this.requestTimeoutMs));
  }

  createBooking(draft: BookingDraft) {
    // POST /api/bookings: الخادم يعيد فحص الوقت ويحفظ Booking في MongoDB.
    // لا يعتبر ظهور الوقت قابلاً للاختيار في الواجهة ضماناً نهائياً؛ قد يختاره
    // عميل آخر في اللحظة نفسها، لذلك يعيد الخادم التحقق عند إنشاء الحجز.
    return this.http.post<BookingResponse>(`${this.apiUrl}/bookings`, draft);
  }

  getBooking(id: string, manageToken: string) {
    // GET /api/bookings/:id: العميل يثبت ملكيته للتذكرة عبر manageToken،
    // وليس عبر token صلاحيات Admin.
    return this.http.get<BookingRecord>(`${this.apiUrl}/bookings/${id}`, {
      headers: { 'X-Booking-Token': manageToken },
    });
  }

  deleteBooking(id: string, manageToken: string) {
    // DELETE /api/bookings/:id: إلغاء العميل يتطلب manageToken الخاص بالحجز.
    return this.http.delete<void>(`${this.apiUrl}/bookings/${id}`, {
      headers: { 'X-Booking-Token': manageToken },
    });
  }

  getAdminBookings(search = '') {
    // GET /api/admin/bookings: يعيد الحجوزات النشطة من نفس مصدر MongoDB
    // الذي تعتمد عليه حسابات الساعات المتاحة، ويحتاج Authorization من interceptor.
    return this.http
      .get<BookingRecord[]>(`${this.apiUrl}/admin/bookings`, {
        params: search ? new HttpParams().set('search', search) : undefined,
      })
      .pipe(timeout(this.requestTimeoutMs));
  }

  getAdminServices() {
    // GET /api/admin/services: يعيد كل الخدمات، بما فيها المعطلة، لإدارتها.
    return this.http
      .get<ServiceOption[]>(`${this.apiUrl}/admin/services`)
      .pipe(timeout(this.requestTimeoutMs));
  }

  createAdminService(service: Omit<ServiceOption, 'id'>) {
    // POST /api/admin/services: ينشئ خدمة جديدة في المصدر الدائم.
    return this.http.post<ServiceOption>(`${this.apiUrl}/admin/services`, service);
  }

  updateAdminService(id: string, service: Partial<Omit<ServiceOption, 'id'>>) {
    // PUT /api/admin/services/:id: يحفظ تعديل الخدمة ثم تعيد الواجهة جلب
    // الخدمات الظاهرة للعميل لتبقى القوائم متزامنة.
    return this.http.put<ServiceOption>(`${this.apiUrl}/admin/services/${id}`, service);
  }

  createAdminBooking(draft: AdminBookingDraft) {
    // POST /api/admin/bookings: يستعمل قواعد الحجز نفسها مع حلاق محدد.
    return this.http.post<BookingRecord>(`${this.apiUrl}/admin/bookings`, draft);
  }

  deleteAdminBooking(id: string) {
    // DELETE /api/admin/bookings/:id: يلغي الحجز ويحرر أقفال الدقائق
    // حتى تظهر الساعة متاحة في إعادة الحساب التالية.
    return this.http
      .delete<void>(`${this.apiUrl}/admin/bookings/${id}`)
      .pipe(timeout(this.requestTimeoutMs));
  }

  getAdminSchedule() {
    // GET /api/admin/schedule: يعيد إعداد ساعات العمل العام للمحل.
    return this.http
      .get<ShopSchedule>(`${this.apiUrl}/admin/schedule`)
      .pipe(timeout(this.requestTimeoutMs));
  }

  saveAdminSchedule(schedule: ShopSchedule) {
    // نرسل عقد API العام فقط. حقل MongoDB الداخلي `key` لا يجب أن يصل إلى
    // التحقق الصارم في الخادم لأنه ليس جزءًا من إعدادات الواجهة.
    const request: ShopSchedule = {
      workingDays: [...schedule.workingDays],
      openTime: schedule.openTime,
      closeTime: schedule.closeTime,
    };

    return this.http.put<ShopSchedule>(`${this.apiUrl}/admin/schedule`, request);
  }

  getAdminBarbers() {
    // GET /api/admin/barbers: قائمة الإدارة الكاملة المستخدمة في الحذف والإضافة.
    return this.http
      .get<BarberOption[]>(`${this.apiUrl}/admin/barbers`)
      .pipe(timeout(this.requestTimeoutMs));
  }

  addAdminBarber(barber: Partial<BarberOption> & Pick<BarberOption, 'name'>) {
    // POST /api/admin/barbers: يضيف حلاقًا إلى MongoDB.
    return this.http.post<BarberOption>(`${this.apiUrl}/admin/barbers`, barber);
  }

  deleteAdminBarber(id: string) {
    // DELETE /api/admin/barbers/:id: الخادم يمنع حذف آخر حلاق متبقٍ.
    return this.http.delete<void>(`${this.apiUrl}/admin/barbers/${id}`);
  }
}
