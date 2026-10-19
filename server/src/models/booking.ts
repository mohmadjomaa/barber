import { Schema, model } from 'mongoose';

export type ReminderPreference = 'sms' | 'whatsapp' | 'email';
export type PaymentMethod = 'pay-in-shop' | 'deposit';
export type BookingStatus = 'active' | 'cancelled';

export interface BookingDocument {
  serviceId: string;
  barberId: string;
  service: string;
  barber: string;
  duration: number;
  price: number;
  date: string;
  time: string;
  startMinute: number;
  endMinute: number;
  name: string;
  phone: string;
  notes: string;
  reminderPreference: ReminderPreference;
  paymentMethod: PaymentMethod;
  status: BookingStatus;
  manageTokenHash: string;
  createdAt: Date;
  updatedAt: Date;
}

// المصدر الدائم للحجوزات. نخزن serviceId/barberId للعلاقات، ونخزن الاسمين
// للعرض التاريخي حتى لو تغير اسم الخدمة أو الحلاق لاحقًا.
const bookingSchema = new Schema<BookingDocument>(
  {
    serviceId: { type: String, required: true, index: true },
    barberId: { type: String, required: true, index: true },
    service: { type: String, required: true },
    barber: { type: String, required: true },
    duration: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    startMinute: { type: Number, required: true },
    endMinute: { type: Number, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    notes: { type: String, default: '' },
    reminderPreference: { type: String, enum: ['sms', 'whatsapp', 'email'], default: 'sms' },
    paymentMethod: { type: String, enum: ['pay-in-shop', 'deposit'], default: 'pay-in-shop' },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    manageTokenHash: { type: String, required: true },
  },
  { timestamps: true },
);

// يساعد هذا الفهرس على قراءة الحجوزات النشطة لتاريخ وحلاق محددين بسرعة عند
// حساب الساعات التي ما زالت متاحة للحجز.
bookingSchema.index({ date: 1, barberId: 1, status: 1 });
// Matches the Admin list query exactly: active records, then chronological order.
bookingSchema.index({ status: 1, date: 1, startMinute: 1 });

bookingSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // لا نرسل hash الخاص بإدارة الحجز ولا دقائق الحساب الداخلية إلى الواجهة.
    const output = ret as unknown as Record<string, unknown>;
    output['id'] = String(output['_id']);
    delete output['_id'];
    delete output['__v'];
    delete output['manageTokenHash'];
    delete output['startMinute'];
    delete output['endMinute'];
    return ret;
  },
});

export const BookingModel = model<BookingDocument>('Booking', bookingSchema);
