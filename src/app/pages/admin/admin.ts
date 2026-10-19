import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { getApiErrorMessage } from '../../services/api-error';
import { Auth } from '../../services/auth';
import { BookingApiService } from '../../services/booking-api';
import { compareBookingsByDate, isUpcomingBooking, relativeBookingDate } from '../../services/booking-list';
import {
  AdminBookingDraft,
  BarberOption,
  BookingRecord,
  BookingStateService,
  ServiceOption,
  ShopSchedule,
  TimeSlotOption,
} from '../../services/booking-state';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  // ========================================
  // لوحة الإدارة: API → MongoDB → إعادة جلب الواجهة
  // ========================================
  // أي تعديل هنا يذهب إلى /api/admin، يحفظه الخادم في MongoDB، ثم نعيد جلب
  // البيانات أو الساعات المتاحة المتأثرة كي لا تعتمد الشاشة على نسخة قديمة.
  private bookingState = inject(BookingStateService);
  private bookingApi = inject(BookingApiService);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private auth = inject(Auth);
  private router = inject(Router);
  services = this.bookingState.services;
  adminServices: ServiceOption[] = [];
  barbers = this.bookingState.barbers;
  readonly dayOptions = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ];

  bookings: BookingRecord[] = [];
  // تبقى رسالة الإلغاء للاستخدامات الداخلية المتبقية، أما الإلغاء المرئي فانتقل لصفحة الحجوزات.
  bookingActionMessage = '';
  bookingActionError = '';
  isDeletingBookingId: string | null = null;
  schedule: ShopSchedule = { workingDays: [], openTime: '', closeTime: '' };
  adminDates: Array<{
    iso: string;
    day: string;
    monthDay: string;
    display: string;
    hasSlots?: boolean;
    closed?: boolean;
  }> = [];
  adminSlots: TimeSlotOption[] = [];
  adminBooking: AdminBookingDraft = this.getEmptyAdminBooking();
  scheduleMessage = '';
  scheduleError = '';
  adminBookingMessage = '';
  adminBookingError = '';
  barberForm = this.getEmptyBarberForm();
  barberMessage = '';
  barberError = '';
  isAddingBarber = false;
  editingService: ServiceOption | null = null;
  isAddingService = false;
  private editingServiceSnapshot = '';
  serviceMessage = '';
  serviceError = '';
  isCreatingBooking = false;
  isLoadingBookings = true;
  isLoadingSchedule = true;
  isLoadingBarbers = true;
  isLoadingServices = true;
  bookingsLoadError = '';
  scheduleLoadError = '';
  barbersLoadError = '';
  servicesLoadError = '';
  isLoadingAvailability = false;
  private availabilityRequestId = 0;
  private isRefreshingAfterFocus = false;
  private isHandlingAuthenticationFailure = false;
  private initialAvailabilityRequested = false;
  private readonly dashboardStartedAt = performance.now();

  ngOnInit(): void {
    // لا نؤخر فتح صفحة Admin بسبب حساب الساعات المتاحة الأبطأ؛ تظهر بنية اللوحة
    // والحجوزات أولاً، ثم تُحمّل هذه البيانات بشكل مستقل.
    this.recordPerformance('component initialized');
    void this.loadAdminData();
  }

  // حجوزات العميل تُحفظ مباشرة في MongoDB. عند عودة Admin إلى هذه التبويبة
  // نقرأ المصدر نفسه من جديد حتى لا تعرض اللوحة قائمة قديمة.
  @HostListener('window:focus')
  async refreshBookingsAfterFocus() {
    if (this.isLoadingBookings || this.isRefreshingAfterFocus) {
      return;
    }

    this.isRefreshingAfterFocus = true;
    try {
      await this.loadBookings();
    } finally {
      this.isRefreshingAfterFocus = false;
    }
  }

  async loadAdminData() {
    // These reads are independent. Starting all of them here means one slow
    // section never delays the shell or another section's first render.
    await Promise.allSettled([
      this.loadBookings(),
      this.loadServices(),
      this.loadBarbers(),
      this.loadSchedule(),
    ]);
    this.recordPerformance('initial section requests settled');
  }

  /**
   * يحمّل بيانات لوحة Admin من API ثم من MongoDB في الخادم.
   *
   * تبدأ الحجوزات أولاً لأنها المحتوى الأساسي. بعد ذلك تُطلب الخدمات والحلاقون
   * وساعات العمل بشكل مستقل، لذلك تعطل طلب إعداد واحد لا يخفي بقية البيانات.
   */
  async loadAdminDataLegacy() {
    try {
      // الحجوزات هي المحتوى الأساسي للوحة؛ نجلبها أولًا كي لا يمنع تأخر إعداد
      // ثانوي مثل schedule ظهور قائمة حجوزات العميل.
      const bookings = await firstValueFrom(this.bookingApi.getAdminBookings());
      this.bookingState.setBookings(bookings);
      this.bookings = bookings;
    } catch (error) {
      if (this.isAuthenticationError(error)) {
        this.auth.logout();
        await this.router.navigate(['/admin/login'], { replaceUrl: true });
        return;
      }

      this.adminBookingError = getApiErrorMessage(error, 'Could not load admin data.');
    } finally {
      this.isLoadingBookings = false;
    }

    // نحمّل الخدمات والحلاقين وساعات العمل بعدها بشكل مستقل. كل طلب يملك
    // timeout، لذلك لا تبقى لوحة Admin في Loading بلا نهاية.
    void this.loadAdminConfiguration();
  }

  private async loadAdminConfiguration() {
    const [servicesResult, adminServicesResult, barbersResult, scheduleResult] =
      await Promise.allSettled([
        firstValueFrom(this.bookingApi.getServices()),
        firstValueFrom(this.bookingApi.getAdminServices()),
        firstValueFrom(this.bookingApi.getAdminBarbers()),
        firstValueFrom(this.bookingApi.getAdminSchedule()),
      ]);
    const failedResult = [servicesResult, adminServicesResult, barbersResult, scheduleResult].find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (failedResult && this.isAuthenticationError(failedResult.reason)) {
      this.auth.logout();
      await this.router.navigate(['/admin/login'], { replaceUrl: true });
      return;
    }

    // لا نسمح لفشل إعداد ثانوي بإخفاء بيانات نجحت قراءتها، خصوصًا الحلاقين
    // لأن زر الحذف لا يظهر إلا بجانب العناصر المعروضة.
    if (servicesResult.status === 'fulfilled') {
      this.bookingState.setServices(servicesResult.value);
      this.services = this.bookingState.services;
    }

    if (adminServicesResult.status === 'fulfilled') {
      this.adminServices = adminServicesResult.value.map((service) => ({
        ...service,
        active: service.active !== false,
      }));
    }

    if (barbersResult.status === 'fulfilled') {
      this.bookingState.setBarbers(barbersResult.value);
      this.barbers = this.bookingState.barbers;
    }

    if (scheduleResult.status === 'fulfilled') {
      this.bookingState.setSchedule(scheduleResult.value);
      this.schedule = scheduleResult.value;
    }

    if (
      !this.adminBooking.serviceId ||
      !this.services.some((service) => service.id === this.adminBooking.serviceId)
    ) {
      this.adminBooking = this.getEmptyAdminBooking();
    }

    if (failedResult) {
      this.adminBookingError = getApiErrorMessage(
        failedResult.reason,
        'Could not load all admin settings.',
      );
    }

    if (
      servicesResult.status === 'fulfilled' &&
      barbersResult.status === 'fulfilled' &&
      scheduleResult.status === 'fulfilled'
    ) {
      await this.refreshAdminAvailability();
    }
  }

  async loadBookings() {
    this.isLoadingBookings = true;
    this.bookingsLoadError = '';
    this.recordPerformance('bookings request started');
    try {
      this.bookings = await firstValueFrom(this.bookingApi.getAdminBookings());
      this.bookingState.setBookings(this.bookings);
    } catch (error) {
      this.bookingsLoadError = getApiErrorMessage(error, 'Could not load bookings.');
      await this.handleAuthenticationError(error);
    } finally {
      this.isLoadingBookings = false;
      this.recordPerformance('bookings data rendered');
      this.changeDetectorRef.markForCheck();
    }
  }

  async loadBarbers() {
    this.isLoadingBarbers = true;
    this.barbersLoadError = '';
    this.recordPerformance('barbers request started');
    try {
      this.barbers = await firstValueFrom(this.bookingApi.getAdminBarbers());
      this.bookingState.setBarbers(this.barbers);
      this.requestInitialAvailabilityWhenReady();
    } catch (error) {
      this.barbersLoadError = getApiErrorMessage(error, 'Could not load barbers.');
      await this.handleAuthenticationError(error);
    } finally {
      this.isLoadingBarbers = false;
      this.recordPerformance('barbers data rendered');
      this.changeDetectorRef.markForCheck();
      this.requestInitialAvailabilityWhenReady();
    }
  }

  private async loadServices() {
    this.isLoadingServices = true;
    this.servicesLoadError = '';
    this.recordPerformance('services request started');
    try {
      // The admin catalogue includes inactive services, so it is the one
      // authoritative response for both this section and the booking form.
      this.adminServices = (await firstValueFrom(this.bookingApi.getAdminServices())).map((service) => ({
        ...service,
        active: service.active !== false,
      }));
      this.bookingState.setServices(this.adminServices.filter((service) => service.active !== false));
      this.services = this.bookingState.services;

      if (!this.adminBooking.serviceId || !this.services.some((service) => service.id === this.adminBooking.serviceId)) {
        this.adminBooking = this.getEmptyAdminBooking();
      }
      this.requestInitialAvailabilityWhenReady();
    } catch (error) {
      this.servicesLoadError = getApiErrorMessage(error, 'Could not load services.');
      await this.handleAuthenticationError(error);
    } finally {
      this.isLoadingServices = false;
      this.recordPerformance('services data rendered');
      this.changeDetectorRef.markForCheck();
      this.requestInitialAvailabilityWhenReady();
    }
  }

  private async loadSchedule() {
    this.isLoadingSchedule = true;
    this.scheduleLoadError = '';
    this.recordPerformance('schedule request started');
    try {
      this.schedule = await firstValueFrom(this.bookingApi.getAdminSchedule());
      this.bookingState.setSchedule(this.schedule);
      this.requestInitialAvailabilityWhenReady();
    } catch (error) {
      this.scheduleLoadError = getApiErrorMessage(error, 'Could not load schedule.');
      await this.handleAuthenticationError(error);
    } finally {
      this.isLoadingSchedule = false;
      this.recordPerformance('schedule data rendered');
      this.changeDetectorRef.markForCheck();
      this.requestInitialAvailabilityWhenReady();
    }
  }

  private requestInitialAvailabilityWhenReady() {
    if (
      this.initialAvailabilityRequested ||
      this.isLoadingServices ||
      this.isLoadingBarbers ||
      this.isLoadingSchedule ||
      this.servicesLoadError ||
      this.barbersLoadError ||
      this.scheduleLoadError
    ) {
      return;
    }

    this.initialAvailabilityRequested = true;
    void this.refreshAdminAvailability();
  }

  private async handleAuthenticationError(error: unknown) {
    if (!this.isAuthenticationError(error) || this.isHandlingAuthenticationFailure) {
      return;
    }

    this.isHandlingAuthenticationFailure = true;
    this.auth.logout();
    await this.router.navigate(['/admin/login'], { replaceUrl: true });
  }

  private recordPerformance(event: string) {
    const elapsedMs = Math.round((performance.now() - this.dashboardStartedAt) * 10) / 10;
    console.info(`[admin-dashboard] ${event}: ${elapsedMs}ms`);
  }

  async addBarber() {
    this.barberMessage = '';
    this.barberError = '';

    try {
      const barber = await firstValueFrom(this.bookingApi.addAdminBarber(this.barberForm));
      this.barberMessage = `${barber.name} was added.`;
      this.barberForm = this.getEmptyBarberForm();
      this.isAddingBarber = false;
      await this.loadBarbers();
      await this.onAdminServiceChange();
    } catch (error) {
      this.barberError = getApiErrorMessage(error, 'Could not add barber.');
    }
  }

  openAddBarber() {
    this.barberMessage = '';
    this.barberError = '';
    this.barberForm = this.getEmptyBarberForm();
    this.isAddingBarber = true;
  }

  cancelAddBarber() {
    this.barberForm = this.getEmptyBarberForm();
    this.barberError = '';
    this.isAddingBarber = false;
  }

  async deleteBarber(barber: BarberOption) {
    this.barberMessage = '';
    this.barberError = '';

    try {
      await firstValueFrom(this.bookingApi.deleteAdminBarber(barber.id));
      this.barberMessage = `${barber.name} was removed.`;
      await this.loadBarbers();
      await this.onAdminServiceChange();
    } catch (error) {
      this.barberError = getApiErrorMessage(error, 'Could not delete barber.');
    }
  }

  async deleteBooking(booking: BookingRecord) {
    if (this.isDeletingBookingId) {
      return;
    }

    this.bookingActionMessage = '';
    this.bookingActionError = '';
    this.isDeletingBookingId = booking.id;

    try {
      // DELETE لا يحذف السجل تاريخيًا؛ الخادم يحوّل status إلى cancelled
      // ويحرر أقفال الدقائق، لذا يظهر الوقت مجددًا عند إعادة حساب الساعات المتاحة.
      await firstValueFrom(this.bookingApi.deleteAdminBooking(booking.id));
      await this.loadBookings();
      await this.refreshAdminAvailability();
      this.bookingActionMessage = `Booking for ${booking.name} was cancelled.`;
    } catch (error) {
      if (this.isAuthenticationError(error)) {
        this.auth.logout();
        await this.router.navigate(['/admin/login'], { replaceUrl: true });
        return;
      }

      this.bookingActionError = getApiErrorMessage(
        error,
        'Could not cancel booking. Please try again.',
      );
    } finally {
      this.isDeletingBookingId = null;
    }
  }

  async addService(service = this.editingService) {
    if (!service) {
      return false;
    }
    this.serviceMessage = '';
    this.serviceError = '';
    try {
      const savedService = await firstValueFrom(
        this.bookingApi.createAdminService(this.servicePayload(service)),
      );
      this.adminServices = [...this.adminServices, savedService];
      await this.refreshCustomerServices();
      this.serviceMessage = `${savedService.name} was added.`;
      this.changeDetectorRef.markForCheck();
      return true;
    } catch (error) {
      this.serviceError = getApiErrorMessage(error, 'Could not add service.');
      this.changeDetectorRef.markForCheck();
      return false;
    }
  }

  async saveService(service: ServiceOption) {
    this.serviceMessage = '';
    this.serviceError = '';
    try {
      const saved = await firstValueFrom(
        this.bookingApi.updateAdminService(service.id, this.servicePayload(service)),
      );
      this.adminServices = this.adminServices.map((item) => (item.id === saved.id ? saved : item));
      await this.refreshCustomerServices();
      this.serviceMessage = `${saved.name} was saved.`;
      this.changeDetectorRef.markForCheck();
      return true;
    } catch (error) {
      this.serviceError = getApiErrorMessage(error, 'Could not save service.');
      this.changeDetectorRef.markForCheck();
      return false;
    }
  }

  editService(service: ServiceOption) {
    if (!this.canDiscardServiceEditor()) {
      return;
    }
    this.isAddingService = false;
    this.editingService = { ...service };
    this.editingServiceSnapshot = JSON.stringify(this.editingService);
  }

  openAddService() {
    if (!this.canDiscardServiceEditor()) {
      return;
    }
    this.isAddingService = true;
    this.editingService = { id: '', ...this.emptyService() };
    this.editingServiceSnapshot = JSON.stringify(this.editingService);
  }

  cancelServiceEdit() {
    this.editingService = null;
    this.isAddingService = false;
    this.editingServiceSnapshot = '';
  }

  async saveServiceEditor() {
    if (!this.editingService) {
      return;
    }
    const saved = this.isAddingService
      ? await this.addService(this.editingService)
      : await this.saveService(this.editingService);
    if (saved) {
      this.cancelServiceEdit();
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/admin/login'], { replaceUrl: true });
  }

  get upcomingBookings() {
    return this.bookings.filter((booking) => isUpcomingBooking(booking)).sort(compareBookingsByDate);
  }

  get upcomingBookingCount() {
    return this.upcomingBookings.length;
  }

  bookingDateLabel(booking: BookingRecord) {
    return relativeBookingDate(booking);
  }

  toggleWorkingDay(day: number) {
    this.scheduleMessage = '';
    this.scheduleError = '';

    const workingDays = new Set(this.schedule.workingDays);

    if (workingDays.has(day)) {
      workingDays.delete(day);
    } else {
      workingDays.add(day);
    }

    this.schedule = {
      ...this.schedule,
      workingDays: Array.from(workingDays).sort((first, second) => first - second),
    };
  }

  async saveSchedule() {
    this.scheduleMessage = '';
    this.scheduleError = '';

    try {
      // تغيير ساعات العمل يؤثر في كل الأيام والمواعيد الممكنة؛ لذلك لا يكفي
      // تحديث النموذج المحلي، بل نعيد حساب الساعات المتاحة في نموذج حجز Admin.
      this.schedule = await firstValueFrom(this.bookingApi.saveAdminSchedule(this.schedule));
      this.bookingState.setSchedule(this.schedule);
      await this.refreshAdminAvailability();
      this.scheduleMessage = `Schedule saved. Customers can book ${this.workingDayLabels()} from ${this.formatTime(this.schedule.openTime)} to ${this.formatTime(this.schedule.closeTime)}.`;
      this.changeDetectorRef.markForCheck();
    } catch (error) {
      this.scheduleError = getApiErrorMessage(error, 'Could not save schedule.');
      this.changeDetectorRef.markForCheck();
    }
  }

  async createAdminBooking() {
    this.adminBookingMessage = '';
    this.adminBookingError = '';

    try {
      const booking = await firstValueFrom(this.bookingApi.createAdminBooking(this.adminBooking));
      this.adminBookingMessage = `Booking created for ${booking.name}.`;
      this.adminBooking = this.getEmptyAdminBooking();
      this.isCreatingBooking = false;
      await this.loadBookings();
      await this.refreshAdminAvailability();
    } catch (error) {
      const message = getApiErrorMessage(error, 'Could not create booking.');
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
        await this.refreshAdminAvailability();
      }
      this.adminBookingError = message;
    }
  }

  openCreateBooking() {
    this.adminBookingMessage = '';
    this.adminBookingError = '';
    this.isCreatingBooking = true;
    void this.refreshAdminAvailability();
  }

  cancelCreateBooking() {
    this.adminBooking = this.getEmptyAdminBooking();
    this.adminSlots = [];
    this.adminBookingMessage = '';
    this.adminBookingError = '';
    this.isCreatingBooking = false;
  }

  async onAdminServiceChange() {
    const compatibleBarbers = this.compatibleAdminBarbers;

    if (!compatibleBarbers.some((barber) => barber.id === this.adminBooking.barberId)) {
      this.adminBooking.barberId = compatibleBarbers[0]?.id || '';
    }

    await this.refreshAdminAvailability();
  }

  async refreshAdminAvailability() {
    // نفس قواعد العميل، لكن Admin يختار حلاقًا محددًا. نقرأ days أولًا ثم
    // نطلب الساعات المتاحة للتاريخ الصالح، وكلاهما يأتي من الخادم.
    const requestId = ++this.availabilityRequestId;

    // Services and barbers load independently. Resolve the selected barber only
    // after both catalogs are available, and preserve the customer's details.
    if (!this.services.some((service) => service.id === this.adminBooking.serviceId)) {
      this.adminBooking.serviceId = this.services[0]?.id || '';
    }
    const compatibleBarbers = this.compatibleAdminBarbers;
    if (!compatibleBarbers.some((barber) => barber.id === this.adminBooking.barberId)) {
      this.adminBooking.barberId = compatibleBarbers[0]?.id || '';
    }

    try {
      this.isLoadingAvailability = true;
      this.adminSlots = [];
      this.adminBooking.time = '';
      this.adminBookingError = '';
      const dates = await firstValueFrom(
        this.bookingApi.getAvailabilityDates({
          days: 14,
          serviceId: this.adminBooking.serviceId || null,
          barberId: this.adminBooking.barberId || null,
          barberPreference: 'specific',
        }),
      );

      // لا تسمح لاستجابة قديمة، بعد تغيير service/barber/date، أن تستبدل
      // الخيارات الأحدث في النموذج.
      if (requestId !== this.availabilityRequestId) {
        return;
      }

      this.adminDates = dates;

      const selectedDate = this.adminDates.find((date) => date.iso === this.adminBooking.date);
      if (!selectedDate || selectedDate.hasSlots === false) {
        this.adminBooking.date = this.adminDates.find((date) => date.hasSlots !== false)?.iso || '';
      }

      if (!this.adminBooking.date || !this.adminBooking.serviceId || !this.adminBooking.barberId) {
        this.adminSlots = [];
        this.adminBooking.time = '';
        return;
      }

      const slotRequest = {
        date: this.adminBooking.date,
        serviceId: this.adminBooking.serviceId,
        barberId: this.adminBooking.barberId,
        barberPreference: 'specific' as const,
      };
      const slotGroups = await firstValueFrom(this.bookingApi.getAvailabilitySlots(slotRequest));

      if (
        requestId !== this.availabilityRequestId ||
        this.adminBooking.date !== slotRequest.date ||
        this.adminBooking.serviceId !== slotRequest.serviceId ||
        this.adminBooking.barberId !== slotRequest.barberId
      ) {
        return;
      }

      this.adminSlots = slotGroups.flatMap((group) => group.slots).filter((slot) => !slot.disabled);

      if (!this.adminSlots.some((slot) => slot.time === this.adminBooking.time)) {
        this.adminBooking.time = this.adminSlots[0]?.time || '';
      }
    } catch (error) {
      if (requestId !== this.availabilityRequestId) {
        return;
      }

      this.adminSlots = [];
      this.adminBooking.time = '';
      this.adminBookingError = getApiErrorMessage(
        error,
        'Could not load available appointment times.',
      );
    } finally {
      if (requestId === this.availabilityRequestId) {
        this.isLoadingAvailability = false;
        this.changeDetectorRef.markForCheck();
      }
    }
  }

  get compatibleAdminBarbers() {
    return this.bookingState.getCompatibleBarbers(this.adminBooking.serviceId);
  }

  private getEmptyBarberForm(): Partial<BarberOption> & Pick<BarberOption, 'name'> {
    return {
      name: '',
      title: '',
      specialty: '',
      availability: '',
      nextAvailable: '',
      image: '',
    };
  }

  private async refreshCustomerServices() {
    const services = await firstValueFrom(this.bookingApi.getServices());
    this.bookingState.setServices(services);
    this.services = this.bookingState.services;
    if (!this.services.some((service) => service.id === this.adminBooking.serviceId)) {
      this.adminBooking = this.getEmptyAdminBooking();
    }
    await this.refreshAdminAvailability();
  }

  private emptyService(): Omit<ServiceOption, 'id'> {
    return {
      name: '',
      description: '',
      duration: 30,
      price: 0,
      badge: '',
      bestFor: '',
      popularity: '',
      active: true,
    };
  }

  private canDiscardServiceEditor() {
    return (
      !this.editingService ||
      JSON.stringify(this.editingService) === this.editingServiceSnapshot ||
      window.confirm('Discard unsaved service changes?')
    );
  }

  private servicePayload(service: Omit<ServiceOption, 'id'> | ServiceOption) {
    return {
      name: service.name,
      description: service.description,
      duration: Number(service.duration),
      price: Number(service.price),
      badge: service.badge,
      bestFor: service.bestFor,
      popularity: service.popularity,
      active: service.active !== false,
    };
  }

  private getEmptyAdminBooking(): AdminBookingDraft {
    const serviceId = this.services[0]?.id || '';
    const barberId = this.bookingState.getCompatibleBarbers(serviceId)[0]?.id || '';

    return {
      serviceId,
      barberId,
      date: '',
      time: '',
      name: '',
      phone: '',
      notes: '',
    };
  }

  private workingDayLabels(): string {
    const labels = this.dayOptions
      .filter((day) => this.schedule.workingDays.includes(day.value))
      .map((day) => day.label);

    return labels.length ? labels.join(', ') : 'no working days';
  }

  formatTime(time: string): string {
    return this.bookingState.formatTime(time);
  }

  private isAuthenticationError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      ((error as { status?: unknown }).status === 401 ||
        (error as { status?: unknown }).status === 403)
    );
  }
}
