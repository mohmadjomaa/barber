import { Schema, model } from 'mongoose';

export interface ServiceOptionDocument {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  badge: string;
  bestFor: string;
  popularity: string;
  barberIds?: string[];
  active?: boolean;
}

const serviceOptionSchema = new Schema<ServiceOptionDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    badge: { type: String, required: true },
    bestFor: { type: String, required: true },
    popularity: { type: String, required: true },
    barberIds: [{ type: String }]
    , active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

serviceOptionSchema.index({ createdAt: 1 });

serviceOptionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const output = ret as unknown as Record<string, unknown>;
    delete output['_id'];
    delete output['__v'];
    return ret;
  }
});

export const ServiceOptionModel = model<ServiceOptionDocument>('ServiceOption', serviceOptionSchema);
