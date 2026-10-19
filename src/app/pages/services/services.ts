import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiErrorMessage } from '../../services/api-error';
import { BookingApiService } from '../../services/booking-api';
import { LanguageService } from '../../services/language';
import {
  BookingStateService,
  BarberOption,
  ServiceOption,
  TimeSlotGroup,
  TimeSlotOption,
} from '../../services/booking-state';
import { BookingStepper } from '../../shared/booking-stepper/booking-stepper';
import { TimeSlot } from '../../shared/time-slot/time-slot';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, FormsModule, BookingStepper, TimeSlot],
  templateUrl: './services.html',
  styleUrl: './services.css',
})
export class Services implements OnInit, OnDestroy {
  // ========================================
  // مسار حجز العميل والساعات المتاحة للحجز
  // ========================================
  // التسلسل: يختار العميل Service ثم Date. يقرأ الخادم Working Hours ومدة
  // الخدمة والحجوزات الموجودة، ثم يعيد الساعات التي يستطيع العميل حجزها قبل
  // إرسال الحجز.
  // قرار الحجز النهائي يبقى للخادم حتى لو كانت الواجهة تعرض الوقت كمتاح.
  private readonly availabilityCacheLifetimeMs = 30_000;
  private bookingState = inject(BookingStateService);
  private bookingApi = inject(BookingApiService);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private language = inject(LanguageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  services = this.bookingState.services;
  barbers = this.bookingState.barbers;
  dates: Array<{ iso: string; day: string; monthDay: string; display: string; hasSlots?: boolean; closed?: boolean }> = [];
  draft = this.bookingState.getDefaultDraft();
  slotGroups: TimeSlotGroup[] = [];
  activePanel: 'profile' | 'service' | 'time' | 'barber' | 'confirm' | null = 'service';
  profileConfirmed = false;
  serviceConfirmed = false;
  timeConfirmed = false;
  profileErrors: Record<string, string> = {};
  bookingError = '';
  isConfirming = false;
  isLoadingAvailability = false;
  private isLeavingPage = false;
  private availabilityRequestId = 0;
  private isRefreshingAfterFocus = false;
  private isLoadingBookingData = false;
  private readonly availabilityCache = new Map<
    string,
    { groups: TimeSlotGroup[]; expiresAt: number }
  >();
  private readonly availabilityInFlight = new Map<string, Promise<TimeSlotGroup[]>>();
  // كل مسح للـcache يعلن أن أي طلب بدأ قبله لا يحق له تخزين نتيجته لاحقًا.
  // هذا مهم بعد حجز أو تعديل Admin، إذ قد يصل طلب قديم بعد أن نكون قرأنا
  // بيانات أحدث للتاريخ نفسه.
  private availabilityCacheGeneration = 0;

  async ngOnInit() {
    await this.loadBookingData();
  }

  ngOnDestroy() {
    this.isLeavingPage = true;
  }

  // عند العودة إلى التبويب بعد تعديل Admin، نعيد جلب الكتالوج والساعات المتاحة من
  // الخادم لأن البيانات المحلية أو النسخة المؤقتة قد لا تعكس التغيير الجديد.
  @HostListener('window:focus')
  async refreshAfterAdminChange() {
    // مهم: لا نبدأ طلبًا ثانيًا أثناء تحميل الساعات المتاحة. الطلب الأحدث هو مصدر
    // الحقيقة، وتشغيل طلبين قد يسمح برد قديم أن يربك حالة التحميل.
    if (
      this.isLeavingPage ||
      this.isLoadingBookingData ||
      this.isLoadingAvailability ||
      this.isRefreshingAfterFocus
    ) {
      return;
    }

    this.isRefreshingAfterFocus = true;
    try {
      const [services, barbers] = await Promise.all([
        firstValueFrom(this.bookingApi.getServices()),
        firstValueFrom(this.bookingApi.getBarbers()),
      ]);
      this.bookingState.setServices(services);
      this.bookingState.setBarbers(barbers);
      this.clearAvailabilityCache();
      this.services = this.bookingState.services;
      this.barbers = this.bookingState.barbers;

      if (
        this.draft.serviceId &&
        !this.services.some((service) => service.id === this.draft.serviceId)
      ) {
        this.draft.serviceId = null;
        this.draft.time = '';
        this.serviceConfirmed = false;
        this.timeConfirmed = false;
        this.activePanel = 'service';
        return;
      }

      if (this.serviceConfirmed) {
        await this.refreshAvailability();
      }
    } catch {
      // نحتفظ بالبيانات المعروضة عند فشل التحديث؛ طلب الساعات المتاحة نفسه يعرض خطأه.
    } finally {
      this.isRefreshingAfterFocus = false;
    }
  }

  async goBack() {
    if (this.activePanel === 'confirm') {
      this.activePanel = 'profile';
      return;
    }

    if (this.activePanel === 'profile') {
      this.activePanel = 'time';
      return;
    }

    if (this.activePanel === 'time' || this.activePanel === 'barber') {
      this.activePanel = 'service';
      return;
    }
  }

  editBarber() {
    this.timeConfirmed = false;
    this.bookingError = '';
    this.draft.time = '';
    this.bookingState.saveDraft({ time: '' });
    this.activePanel = 'barber';
  }

  editService() {
    this.timeConfirmed = false;
    this.bookingError = '';
    this.draft.time = '';
    this.bookingState.saveDraft({ time: '' });
    this.activePanel = 'service';
  }

  continueProfile() {
    if (!this.validateProfile()) {
      return;
    }

    this.profileConfirmed = true;
    this.bookingState.saveDraft({
      name: this.draft.name.trim(),
      phone: this.draft.phone.trim(),
    });
    this.bookingState.track('submit_profile', { source: 'services' });
    this.activePanel = 'confirm';
  }

  onPhoneInput(value: string) {
    this.draft.phone = value.replace(/\D/g, '').slice(0, 10);
    this.validatePhone();
  }

  async selectService(service: ServiceOption) {
    // مدة الخدمة جزء من حساب الساعات المتاحة؛ لذلك تغييرها يعيد حساب الأيام والساعات
    // حتى لا يبقى يوم يبدو متاحًا لخدمة أقصر فقط.
    this.draft.serviceId = service.id;
    this.serviceConfirmed = true;
    this.timeConfirmed = false;

    if (
      this.draft.barberPreference === 'specific' &&
      !this.bookingState.canBarberPerformService(service.id, this.draft.barberId)
    ) {
      this.draft.barberId = null;
      this.draft.barberPreference = 'any';
    }

    this.bookingState.saveDraft({
      serviceId: service.id,
      barberId: this.draft.barberId,
      barberPreference: this.draft.barberPreference,
    });
    this.bookingState.track('select_service', { serviceId: service.id });
    await this.refreshAvailability();
    this.activePanel = 'time';
  }

  async useBestAvailable() {
    this.draft.barberPreference = 'any';
    this.draft.barberId = null;
    this.timeConfirmed = false;
    this.bookingState.saveDraft({ barberPreference: 'any', barberId: null });
    this.bookingState.track('select_barber', { mode: 'best_available' });
    await this.refreshAvailability();
    this.activePanel = this.serviceConfirmed ? 'time' : 'service';
  }

  async selectBarber(barber: BarberOption) {
    this.draft.barberId = barber.id;
    this.draft.barberPreference = 'specific';
    this.timeConfirmed = false;
    this.bookingState.saveDraft({ barberId: barber.id, barberPreference: 'specific' });
    this.bookingState.track('select_barber', { barberId: barber.id });
    await this.refreshAvailability();
    this.activePanel = this.serviceConfirmed ? 'time' : 'service';
  }

  async pickDate(date: string) {
    const targetDate = this.dates.find((item) => item.iso === date);

    if (targetDate?.hasSlots === false) {
      return;
    }

    this.draft.date = date;
    this.bookingState.saveDraft({ date });
    this.bookingState.track('select_date', { date });
    // شريط الأيام حُسب بالفعل للخدمة والحلاق الحاليين؛ لهذا نطلب ساعات
    // التاريخ المختار فقط بدل إعادة حساب جميع الأيام.
    await this.refreshAvailability(false);
  }

  async chooseTime(time: string) {
    if (
      !this.slotGroups
        .flatMap((group) => group.slots)
        .some((slot) => slot.time === time && !slot.disabled)
    ) {
      return;
    }

    this.draft.time = time;
    this.timeConfirmed = true;
    this.bookingError = '';
    this.bookingState.saveDraft({ time });
    this.bookingState.track('select_time', { time, date: this.draft.date });
    this.activePanel = 'profile';
  }

  async pickEarliest() {
    await this.pickFirstAvailable();
    this.timeConfirmed = !!this.draft.time;
    this.bookingError = '';
    this.activePanel = this.timeConfirmed ? 'profile' : 'time';
  }

  async applyShortcut(shortcut: 'today' | 'tomorrow' | 'weekend' | 'after-work') {
    const availableDates = this.dates.filter((date) => date.hasSlots !== false);
    const targetDate =
      shortcut === 'tomorrow'
        ? availableDates[1] || availableDates[0]
        : shortcut === 'weekend'
          ? availableDates.find((date) => {
              const day = new Date(`${date.iso}T12:00:00`).getDay();
              return day === 5 || day === 6;
            }) || availableDates[0]
          : availableDates[0];

    if (!targetDate) {
      this.draft.time = '';
      this.timeConfirmed = false;
      this.bookingError = 'No available days. Please call the shop.';
      this.bookingState.saveDraft({ time: '' });
      return;
    }

    this.draft.date = targetDate.iso;
    await this.refreshAvailability(false);

    const slots =
      shortcut === 'after-work'
        ? this.slotGroups.find((group) => group.id === 'evening')?.slots || []
        : this.slotGroups.flatMap((group) => group.slots);
    const slot = slots.find((item) => !item.disabled);

    this.draft.time = slot?.time || '';
    this.timeConfirmed = !!this.draft.time;
    this.bookingError = '';
    this.bookingState.saveDraft({ date: this.draft.date, time: this.draft.time });
    this.bookingState.track('select_time', {
      mode: shortcut,
      date: this.draft.date,
      time: this.draft.time,
    });
    this.activePanel = this.timeConfirmed ? 'profile' : 'time';
  }

  continue() {
    if (!this.serviceConfirmed) {
      this.activePanel = 'service';
      return;
    }

    if (!this.timeConfirmed) {
      this.activePanel = 'time';
      return;
    }

    if (!this.profileConfirmed) {
      this.activePanel = 'profile';
      this.continueProfile();
      return;
    }

    if (!this.draft.serviceId || !this.draft.date || !this.draft.time) {
      return;
    }

    this.activePanel = 'confirm';
    this.confirmBooking();
  }

  async confirmBooking() {
    if (this.isConfirming) {
      return;
    }

    if (!this.profileConfirmed && !this.validateProfile()) {
      this.activePanel = 'profile';
      return;
    }

    if (!this.draft.serviceId || !this.draft.date || !this.draft.time) {
      this.timeConfirmed = false;
      this.bookingError = 'Select a service, date, and available time.';
      this.activePanel = 'time';
      return;
    }

    // الخادم هو مصدر الحقيقة لساعات العمل وtimezone والتعارضات الحية. لا
    // نرفض الاختيار هنا اعتماداً على بيانات قديمة في المتصفح؛ POST سيتحقق ثانيةً.
    const barberId = this.draft.barberPreference === 'specific' ? this.draft.barberId : null;
    this.draft.barberId = barberId;
    this.bookingState.saveDraft({
      serviceId: this.draft.serviceId,
      barberId,
      barberPreference: this.draft.barberPreference,
      date: this.draft.date,
      time: this.draft.time,
      name: this.draft.name.trim(),
      phone: this.draft.phone.trim(),
      paymentMethod: 'pay-in-shop',
      reminderPreference: this.draft.reminderPreference || 'sms',
    });
    this.bookingState.track('appointment_defaults_continue', {
      serviceId: this.draft.serviceId,
      barberPreference: this.draft.barberPreference,
      date: this.draft.date,
      time: this.draft.time,
    });

    try {
      this.isConfirming = true;
      this.bookingError = '';
      const response = await firstValueFrom(
        this.bookingApi.createBooking(this.bookingState.getDraft()),
      );
      // الحجز الناجح يغيّر الساعات المتاحة في الخادم؛ نمسح النسخة المؤقتة قبل الانتقال
      // حتى لا تظهر الساعة المحجوزة عند الرجوع لاختيار وقت لاحقًا.
      this.clearAvailabilityCache();
      this.bookingState.storeConfirmedBooking(response.booking, response.manageToken);
      this.bookingState.track('booking_confirmed', {
        bookingId: response.booking.id,
        service: response.booking.service,
        barber: response.booking.barber,
      });
      this.isLeavingPage = true;
      this.router.navigate(['/success']);
    } catch (error) {
      this.isConfirming = false;
      const bookingError = this.friendlyBookingError(
        getApiErrorMessage(
          error,
          'We could not confirm your booking. Please try again or call the shop.',
        ),
      );
      this.bookingError = bookingError;

      if (
        this.bookingError.includes('no longer available') ||
        this.bookingError.includes('not available')
      ) {
        this.timeConfirmed = false;
        this.activePanel = 'time';
        // 409 يعني أن عميلًا آخر أو Admin غيّر الساعات المتاحة بعد اختيارنا. نمسح
        // النسخة المؤقتة ونعيد القراءة حتى لا يبقى وقت متعارض ظاهراً.
        this.clearAvailabilityCache();
        const refreshRequestId = this.availabilityRequestId + 1;
        await this.refreshAvailability();
        if (refreshRequestId === this.availabilityRequestId && !this.bookingError) {
          this.bookingError = bookingError;
        }
      }
    }
  }

  private validateProfile() {
    this.profileErrors = {};
    const name = this.draft.name.trim();

    if (/^[+-]?\d+(?:\.\d+)?$/.test(name)) {
      this.profileErrors['name'] =
        `Name: Expected a string, but received a numeric value (${JSON.stringify(name)}). Reason: a name must include letters.`;
    } else if (name.length < 2) {
      this.profileErrors['name'] = 'Enter your name.';
    }

    this.validatePhone();

    return Object.keys(this.profileErrors).length === 0;
  }

  private validatePhone() {
    if (!this.draft.phone) {
      this.profileErrors['phone'] = 'Enter your phone number.';
      return false;
    }

    if (!/^05\d{8}$/.test(this.draft.phone)) {
      this.profileErrors['phone'] = 'Enter a valid phone number.';
      return false;
    }

    delete this.profileErrors['phone'];
    return true;
  }

  private async loadBookingData() {
    // تحميل البيانات المستقلة معًا يقلل زمن البداية: الخدمات والحلاقون وشريط
    // الأيام. بعد ذلك فقط نحدد draft صالح ونطلب ساعات يومه.
    this.isLoadingBookingData = true;

    try {
      const [services, barbers, dates] = await Promise.all([
        firstValueFrom(this.bookingApi.getServices()),
        firstValueFrom(this.bookingApi.getBarbers()),
        firstValueFrom(this.bookingApi.getAvailabilityDates({ days: 7 })),
      ]);

      if (this.isLeavingPage) {
        return;
      }

      this.bookingState.setServices(services);
      this.bookingState.setBarbers(barbers);
      this.services = this.bookingState.services;
      this.barbers = this.bookingState.barbers;
      this.dates = dates;
      const requestedServiceId = this.route.snapshot.queryParamMap.get('service');
      const validRequestedService =
        requestedServiceId && this.services.some((service) => service.id === requestedServiceId)
          ? requestedServiceId
          : null;
      this.draft = this.bookingState.prepareQuickBooking({
        barberPreference: 'any',
        serviceId: validRequestedService || undefined,
      });
      // Availability is server-calculated. Select a date returned by that
      // response before requesting slots so a fresh browser never sends an
      // empty date while local defaults are intentionally absent.
      if (!this.dates.some((date) => date.iso === this.draft.date && date.hasSlots !== false)) {
        this.draft.date = this.dates.find((date) => date.hasSlots !== false)?.iso || '';
      }
      this.serviceConfirmed = !!validRequestedService;
      this.changeDetectorRef.markForCheck();
      await this.refreshAvailability(!!this.draft.serviceId);
      this.activePanel = this.serviceConfirmed ? 'time' : 'service';
    } catch {
      this.bookingError =
        'We could not load available appointments. Please refresh or call the shop.';
    } finally {
      this.isLoadingBookingData = false;
    }
  }

  /**
   * يحدّث أيام وساعات الحجز المعروضة بعد تغيير الخدمة أو الحلاق أو التاريخ.
   *
   * نطلب `availability/dates` والساعات المتاحة للتاريخ الحالي بالتوازي عند الحاجة، ثم
   * نقبل النتيجة فقط إذا كان `requestId` ما زال يخص آخر اختيار للمستخدم. هذا
   * يمنع وصول رد قديم من الشبكة بعد أن يختار العميل يوماً جديداً.
   */
  private async refreshAvailability(loadDates = true) {
    const requestId = ++this.availabilityRequestId;
    // لا نعرض ساعات اليوم السابق تحت تاريخ جديد أثناء الطلب؛ الحالة الفارغة
    // المؤقتة أدق من نتائج قديمة قد تسمح للمستخدم باختيار وقت خاطئ.
    this.isLoadingAvailability = true;
    // A new request supersedes any previous availability failure. Leaving the
    // old message in place would let a stale error render beside this request's
    // loading indicator.
    this.bookingError = '';
    this.slotGroups = [];
    this.draft.time = '';
    this.timeConfirmed = false;

    try {
      // نبدأ طلب الأيام وطلب ساعات التاريخ الحالي بالتوازي. لا يعتمد أحدهما
      // على الآخر عادةً، وهذا يمنع انتظار طلب الأيام ثم طلب الساعات بشكل متتالٍ.
      const initialSlotRequest = this.currentSlotRequest();
      const initialSlotGroups = this.getSlotGroupsCached(initialSlotRequest);

      if (loadDates) {
        const datesRequest = firstValueFrom(
          this.bookingApi.getAvailabilityDates({
            days: 7,
            serviceId: this.draft.serviceId,
            barberId: this.draft.barberId,
            barberPreference: this.draft.barberPreference,
          }),
        );
        const [dates] = await Promise.all([datesRequest, initialSlotGroups]);

        // requestId يمنع استجابة اختيار قديم من استبدال اليوم الذي ضغطه
        // المستخدم لاحقًا أثناء وجود طلبين بالشبكة.
        if (this.isLeavingPage || requestId !== this.availabilityRequestId) {
          return;
        }

        this.dates = dates;
      }

      if (this.isLeavingPage || requestId !== this.availabilityRequestId) {
        return;
      }

      const selectedDate = this.dates.find((date) => date.iso === this.draft.date);
      if (!selectedDate || selectedDate.hasSlots === false) {
        this.draft.date =
          this.dates.find((date) => date.hasSlots !== false)?.iso || this.dates[0]?.iso || '';
      }

      if (
        this.serviceConfirmed &&
        this.draft.barberPreference === 'specific' &&
        this.draft.serviceId &&
        !this.bookingState.canBarberPerformService(this.draft.serviceId, this.draft.barberId)
      ) {
        this.draft.barberId = null;
        this.draft.barberPreference = 'any';
      }

      if (loadDates) {
        // شريط الأيام يحدد مسبقاً الأيام القابلة للحجز. نطلب ساعات هذه الأيام
        // في الخلفية لكي يظهر وقت اليوم التالي فور اختياره بدل انتظار الشبكة.
      }

      const slotRequest = this.currentSlotRequest();
      // إذا بقي التاريخ نفسه نعيد استعمال الوعد الذي بدأناه. وإن تغير بسبب
      // يوم مغلق/ممتلئ، نطلب تاريخ البديل بالمفتاح الكامل نفسه.
      const slotGroups =
        this.availabilityCacheKey(slotRequest) === this.availabilityCacheKey(initialSlotRequest)
          ? await initialSlotGroups
          : await this.getSlotGroupsCached(slotRequest);

      if (
        this.isLeavingPage ||
        requestId !== this.availabilityRequestId ||
        this.draft.date !== slotRequest.date ||
        this.draft.barberId !== slotRequest.barberId ||
        this.draft.serviceId !== slotRequest.serviceId ||
        this.draft.barberPreference !== slotRequest.barberPreference
      ) {
        return;
      }

      // نضع نتيجة جديدة بدل فلترة Arrays اليوم السابق. هذا يمنع تراكم filters
      // عند التنقل بين الأيام أو عند وصول استجابة متأخرة.
      this.slotGroups = slotGroups;

      if (
        !this.slotGroups
          .flatMap((group) => group.slots)
          .some((slot) => slot.time === this.draft.time && !slot.disabled)
      ) {
        const nextSlot = this.slotGroups
          .flatMap((group) => group.slots)
          .find((slot) => !slot.disabled);
        this.draft.time = nextSlot?.time || '';
        this.timeConfirmed = false;
      }

      this.bookingError = '';
      this.bookingState.saveDraft({ date: this.draft.date, time: this.draft.time });
      this.changeDetectorRef.markForCheck();
    } catch {
      if (this.isLeavingPage || requestId !== this.availabilityRequestId) {
        return;
      }

      this.slotGroups = [];
      this.draft.time = '';
      this.timeConfirmed = false;
      this.bookingError =
        'We could not load available times. Please try another day or call the shop.';
      this.changeDetectorRef.markForCheck();
    } finally {
      if (requestId === this.availabilityRequestId) {
        this.isLoadingAvailability = false;
      }
    }
  }

  private async pickFirstAvailable() {
    try {
      this.dates = await firstValueFrom(
        this.bookingApi.getAvailabilityDates({
          days: 7,
          serviceId: this.draft.serviceId,
          barberId: this.draft.barberId,
          barberPreference: this.draft.barberPreference,
        }),
      );

      for (const date of this.dates.filter((item) => item.hasSlots !== false)) {
        const groups = await firstValueFrom(
          this.bookingApi.getAvailabilitySlots({
            date: date.iso,
            barberId: this.draft.barberId,
            serviceId: this.draft.serviceId,
            barberPreference: this.draft.barberPreference,
          }),
        );
        const nextSlot = groups.flatMap((group) => group.slots).find((slot) => !slot.disabled);

        if (nextSlot) {
          this.draft.date = date.iso;
          this.draft.time = nextSlot.time;
          await this.refreshAvailability(false);
          return;
        }
      }

      this.draft.date = '';
      this.draft.time = '';
      await this.refreshAvailability(false);
    } catch {
      this.draft.time = '';
      this.timeConfirmed = false;
      this.bookingError =
        'We could not load available times. Please try another day or call the shop.';
    }
  }

  private currentSlotRequest() {
    return {
      date: this.draft.date,
      barberId: this.draft.barberId,
      serviceId: this.draft.serviceId,
      barberPreference: this.draft.barberPreference,
    };
  }

  /**
   * يجلب الساعات المتاحة من نسخة مؤقتة قصيرة أو من API عند عدم وجود نسخة مناسبة.
   *
   * المفتاح يجمع التاريخ والخدمة والحلاق وطريقة الاختيار؛ لذلك لا يمكن لبيانات
   * يوم أو خدمة أخرى أن تظهر بالخطأ. بعد نجاح حجز أو تعديل من Admin نمسح النسخة المؤقتة
   * لأن قائمة الساعات المتاحة القديمة لم تعد صالحة.
   */
  private getSlotGroupsCached(request: {
    date: string;
    serviceId: string | null;
    barberId: string | null;
    barberPreference: 'any' | 'specific';
  }) {
    const key = this.availabilityCacheKey(request);
    const cached = this.availabilityCache.get(key);

    // مفتاح النسخة المؤقتة يتضمن date + service + barber + preference؛ لا يجوز استخدام
    // ساعات خدمة أو حلاق أو يوم آخر. صلاحيته قصيرة والتأكيد في الخادم دائمًا.
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.groups);
    }

    this.availabilityCache.delete(key);
    const pending = this.availabilityInFlight.get(key);
    if (pending) {
      return pending;
    }

    const cacheGeneration = this.availabilityCacheGeneration;
    let requestPromise: Promise<TimeSlotGroup[]>;
    requestPromise = firstValueFrom(this.bookingApi.getAvailabilitySlots(request))
      .then((groups) => {
        if (cacheGeneration === this.availabilityCacheGeneration) {
          this.availabilityCache.set(key, {
            groups,
            expiresAt: Date.now() + this.availabilityCacheLifetimeMs,
          });
        }
        return groups;
      })
      .finally(() => {
        // لا يحذف طلب قديم promise أحدث بدأ بالمفتاح نفسه بعد مسح الـcache.
        if (this.availabilityInFlight.get(key) === requestPromise) {
          this.availabilityInFlight.delete(key);
        }
      });

    this.availabilityInFlight.set(key, requestPromise);
    return requestPromise;
  }

  private availabilityCacheKey(request: {
    date: string;
    serviceId: string | null;
    barberId: string | null;
    barberPreference: 'any' | 'specific';
  }) {
    return [
      request.date,
      request.serviceId || '',
      request.barberId || '',
      request.barberPreference,
    ].join('|');
  }

  private clearAvailabilityCache() {
    this.availabilityCacheGeneration += 1;
    this.availabilityCache.clear();
    this.availabilityInFlight.clear();
  }

  private prefetchSlotsForDates(dates: Array<{ iso: string; hasSlots?: boolean }>) {
    const context = this.currentSlotRequest();
    const uncachedRequests = dates
      .filter((date) => date.hasSlots !== false && date.iso !== context.date)
      .map((date) => this.getSlotGroupsCached({ ...context, date: date.iso }));

    // هذا الجلب المسبق يحسن الانتقال بين الأيام فقط؛ فشله لا يغير الشاشة ولا
    // يحول النتيجة الصحيحة للتاريخ المختار إلى خطأ.
    void Promise.all(uncachedRequests).catch(() => undefined);
  }

  get selectedService() {
    return this.bookingState.getService(this.draft.serviceId);
  }

  get selectedBarber() {
    return this.bookingState.getBarber(this.draft.barberId);
  }

  get compatibleBarbers() {
    return this.serviceConfirmed
      ? this.bookingState.getCompatibleBarbers(this.draft.serviceId)
      : this.barbers;
  }

  get bottomSummary() {
    if (!this.profileConfirmed) {
      return {
        title: this.draft.name.trim() || this.t('Your details'),
        meta: this.draft.phone.trim() || this.t('Name and phone'),
        barber: this.t('Start booking'),
      };
    }

    const service = this.selectedService;
    return {
        title: service ? service.name : this.t('Next available haircut'),
        meta:
        [this.formattedDate, this.formatTime(this.draft.time)].filter(Boolean).join(' / ') ||
        this.t('Choose a day and time'),
      barber: this.barberLabel,
    };
  }

  get formattedDate() {
    return this.bookingState.formatDate(this.draft.date);
  }

  formatTime(time: string) {
    return this.bookingState.formatTime(time);
  }

  dateWeekday(date: string) {
    return this.bookingState.formatDateWeekday(date);
  }

  dateMonthDay(date: string) {
    return this.bookingState.formatDateMonthDay(date);
  }

  timeSectionLabel(group: TimeSlotGroup) {
    return this.bookingState.formatTimeSectionLabel(group);
  }

  get barberLabel() {
    return this.draft.barberPreference === 'any'
      ? this.t('Any available barber')
      : this.selectedBarber?.name || this.t('Choose barber');
  }

  get continueLabel() {
    if (!this.serviceConfirmed) {
      return this.t('Choose Service');
    }

    if (!this.timeConfirmed) {
      return this.t('Choose Time');
    }

    if (!this.profileConfirmed) {
      return this.t('Continue');
    }

    return this.isConfirming ? this.t('Confirming...') : this.t('Confirm Booking');
  }

  get currentStep() {
    if (this.activePanel === 'profile') {
      return 2;
    }

    return this.activePanel === 'confirm' ? 3 : 1;
  }

  slotAccent(slot: TimeSlotOption) {
    if (slot.label) {
      return slot.label;
    }

    if (slot.scarcity) {
      return slot.scarcity;
    }

    return this.draft.barberPreference === 'any' && slot.barberName
      ? `${this.t('With')} ${slot.barberName}`
      : '';
  }

  private t(value: string) {
    return this.language.text(value);
  }

  private friendlyBookingError(message: string) {
    if (message.includes('time is not available')) {
      return 'That time is no longer available. Please choose another time.';
    }

    return message || 'We could not confirm your booking. Please try again or call the shop.';
  }
}
