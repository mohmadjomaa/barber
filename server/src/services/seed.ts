import { defaultBarbers, defaultSchedule, defaultServices } from '../data/defaults';
import { connectDb, disconnectDb } from '../config/db';
import { BarberModel } from '../models/barber';
import { ServiceOptionModel } from '../models/service-option';
import { ShopSettingsModel } from '../models/shop-settings';

export async function seedDefaults() {
  // A configured shop means this persistent database has already been seeded.
  // Skipping write upserts on subsequent serverless cold starts also prevents
  // deleted or edited admin data from being silently restored.
  if (await ShopSettingsModel.exists({ key: 'default' })) {
    return;
  }

  await ServiceOptionModel.bulkWrite(
    defaultServices.map((service) => ({
      updateOne: { filter: { id: service.id }, update: { $setOnInsert: service }, upsert: true },
    })),
  );

  await BarberModel.bulkWrite(
    defaultBarbers.map((barber) => ({
      updateOne: { filter: { id: barber.id }, update: { $setOnInsert: barber }, upsert: true },
    })),
  );

  await ShopSettingsModel.updateOne(
    { key: 'default' },
    { $setOnInsert: defaultSchedule },
    { upsert: true }
  );
}

if (require.main === module) {
  connectDb()
    .then(seedDefaults)
    .then(() => {
      console.log('Default services, barbers, and schedule seeded.');
    })
    .finally(disconnectDb)
    .catch(error => {
      console.error('Failed to seed defaults:', error);
      process.exitCode = 1;
    });
}
