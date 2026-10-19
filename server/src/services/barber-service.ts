import { BarberDocument, BarberModel } from '../models/barber';
import { ServiceOptionModel } from '../models/service-option';
import { HttpError } from '../utils/http-error';

/**
 * يعيد الحلاقين الذين يمكنهم تنفيذ الخدمة التي اختارها العميل.
 * إذا لم يحدد العميل خدمة، أو لم تربط الخدمة حلاقين محددين، نعيد جميع الحلاقين
 * حتى تبقى صفحة الحجز قادرة على عرض الاختيار المناسب.
 */
export async function getCompatibleBarbers(serviceId?: string | null) {
  const barbers = await BarberModel.find().sort({ createdAt: 1 }).lean();

  if (!serviceId) {
    return barbers;
  }

  const service = await ServiceOptionModel.findOne({ id: serviceId }).lean();

  if (!service || !service.barberIds?.length) {
    return barbers;
  }

  return barbers.filter((barber) => service.barberIds?.includes(barber.id));
}

/**
 * يتأكد أن الحلاق المحدد موجود ضمن قائمة حلاقي الخدمة. نستخدم هذا الفحص قبل
 * إنشاء الحجز حتى لا يقبل الخادم اختياراً غير متاح في صفحة العميل.
 */
export async function canBarberPerformService(serviceId: string | null, barberId: string | null) {
  if (!barberId) {
    return false;
  }

  const compatibleBarbers = await getCompatibleBarbers(serviceId);
  return compatibleBarbers.some((barber) => barber.id === barberId);
}

/**
 * يضيف حلاقاً من صفحة Admin إلى MongoDB. ننشئ id فريداً مرة واحدة لأن الحجز
 * يحفظ `barberId` وليس الاسم، بينما الاسم يمكن أن يتغير لاحقاً للعرض فقط.
 */
export async function addBarber(input: Partial<BarberDocument> & Pick<BarberDocument, 'name'>) {
  const name = input.name.trim();

  if (name.length < 2) {
    throw new HttpError(400, 'Enter the barber name.');
  }

  const existingBarbers = await BarberModel.find().lean();
  const barber = await BarberModel.create({
    id: createUniqueBarberId(name, existingBarbers),
    name,
    title: input.title?.trim() || 'Barber',
    rating: normalizeRating(input.rating),
    reviews: Math.max(0, input.reviews ?? 0),
    specialty: input.specialty?.trim() || 'Haircuts and grooming',
    availability: input.availability?.trim() || 'Available by schedule',
    image: input.image?.trim() || '/img/jpg1.png',
    nextAvailable: input.nextAvailable?.trim() || 'Available soon',
  });

  return barber.toJSON();
}

/**
 * يحذف الحلاق الذي اختاره Admin، لكنه يمنع حذف آخر حلاق حتى لا تصبح صفحة
 * الحجز بلا شخص يمكنه تنفيذ أي خدمة.
 */
export async function deleteBarber(barberId: string) {
  const count = await BarberModel.countDocuments();

  if (count <= 1) {
    throw new HttpError(400, 'At least one barber is required.');
  }

  const deleted = await BarberModel.findOneAndDelete({ id: barberId });

  if (!deleted) {
    throw new HttpError(404, 'Barber was not found.');
  }
}

function createUniqueBarberId(name: string, barbers: Array<{ id: string }>) {
  const baseId = createBarberId(name);
  const existingIds = new Set(barbers.map((barber) => barber.id));

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function createBarberId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `barber-${Date.now()}`;
}

function normalizeRating(rating: number | undefined) {
  if (rating === undefined || !Number.isFinite(rating)) {
    return 5;
  }

  return Math.min(5, Math.max(0, rating));
}
