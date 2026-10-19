import { Schema, model } from 'mongoose';

export interface BarberDocument {
  id: string;
  name: string;
  title: string;
  rating: number;
  reviews: number;
  specialty: string;
  availability: string;
  image: string;
  nextAvailable: string;
}

const barberSchema = new Schema<BarberDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    title: { type: String, required: true },
    rating: { type: Number, required: true, min: 0, max: 5 },
    reviews: { type: Number, required: true, min: 0 },
    specialty: { type: String, required: true },
    availability: { type: String, required: true },
    image: { type: String, required: true },
    nextAvailable: { type: String, required: true }
  },
  { timestamps: true }
);

barberSchema.index({ createdAt: 1 });

barberSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const output = ret as unknown as Record<string, unknown>;
    delete output['_id'];
    delete output['__v'];
    return ret;
  }
});

export const BarberModel = model<BarberDocument>('Barber', barberSchema);
