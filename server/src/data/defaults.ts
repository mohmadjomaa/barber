import { BarberDocument } from '../models/barber';
import { ServiceOptionDocument } from '../models/service-option';
import { ShopSettingsDocument } from '../models/shop-settings';

export const defaultServices: ServiceOptionDocument[] = [
  {
    id: 'signature-cut',
    name: 'Signature Cut',
    description: 'Sharp consultation, tailored cut, wash, and finish.',
    duration: 30,
    price: 90,
    badge: 'Most booked',
    bestFor: 'Busy clients who want a clean refresh',
    popularity: 'Booked 210 times this month',
    active: true
  },
  {
    id: 'beard-detail',
    name: 'Beard Detail',
    description: 'Line work, trim, hydration, and shape refinement.',
    duration: 20,
    price: 55,
    badge: 'Fast option',
    bestFor: 'Maintenance between full appointments',
    popularity: 'Best quick maintenance choice',
    active: true
  },
  {
    id: 'full-grooming',
    name: 'Full Grooming',
    description: 'Haircut, beard sculpt, hot towel, and premium styling.',
    duration: 45,
    price: 135,
    badge: 'Premium',
    bestFor: 'Complete transformation before events',
    popularity: 'Most chosen before events',
    active: true
  }
];

export const defaultBarbers: BarberDocument[] = [
  {
    id: 'ahmed',
    name: 'Ahmed',
    title: 'Fade Specialist',
    rating: 4.9,
    reviews: 168,
    specialty: 'Skin fades and sharp outlines',
    availability: 'Next opening in 45 min',
    image: '/img/jpg1.png',
    nextAvailable: 'Available today'
  }
];

export const defaultSchedule: ShopSettingsDocument = {
  key: 'default',
  workingDays: [0, 1, 2, 3, 4],
  openTime: '09:30',
  closeTime: '19:00'
};
