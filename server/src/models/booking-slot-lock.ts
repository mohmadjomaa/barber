import { Schema, model } from 'mongoose';

/**
 * document لكل دقيقة من موعد نشط. القيد الفريد المركب يجعل حجز نطاق الموعد
 * ذريًا حتى لو وصل طلبان متزامنان، وهي حماية double booking.
 */
export interface BookingSlotLockDocument {
  bookingId: string;
  date: string;
  barberId: string;
  minute: number;
}

const bookingSlotLockSchema = new Schema<BookingSlotLockDocument>(
  {
    bookingId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    barberId: { type: String, required: true },
    minute: { type: Number, required: true, min: 0, max: 1439 },
  },
  { timestamps: true },
);

// الدقيقة نفسها لا يمكن أن تتبع لحجزين للحلاق والتاريخ نفسيهما.
bookingSlotLockSchema.index({ date: 1, barberId: 1, minute: 1 }, { unique: true });

export const BookingSlotLockModel = model<BookingSlotLockDocument>(
  'BookingSlotLock',
  bookingSlotLockSchema,
);

export async function ensureBookingSlotLockIndexes() {
  // نتحقق من index قبل استقبال الطلبات حتى لا تكون حماية التداخل مؤجلة.
  await BookingSlotLockModel.init();
}
