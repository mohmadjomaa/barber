import { Schema, model } from 'mongoose';

export interface ShopSettingsDocument {
  key: 'default';
  workingDays: number[];
  openTime: string;
  closeTime: string;
}

// إعدادات موحّدة للمحل. المفتاح الثابت يجعلها وثيقة واحدة بدلاً من إعدادات
// متفرقة، وهي المصدر الذي يعتمد عليه الخادم لحساب أيام وساعات الحجز المتاحة.
const shopSettingsSchema = new Schema<ShopSettingsDocument>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    workingDays: [{ type: Number, min: 0, max: 6 }],
    openTime: { type: String, required: true },
    closeTime: { type: String, required: true },
  },
  { timestamps: true },
);

shopSettingsSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // الـ API يعيد عقداً بسيطاً للواجهة ولا يسرّب حقول Mongo الداخلية.
    const output = ret as unknown as Record<string, unknown>;
    delete output['_id'];
    delete output['__v'];
    return ret;
  },
});

export const ShopSettingsModel = model<ShopSettingsDocument>('ShopSettings', shopSettingsSchema);
