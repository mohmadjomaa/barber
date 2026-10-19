import mongoose from 'mongoose';
import { env } from './env';

let connectionPromise: Promise<typeof mongoose> | undefined;

export async function connectDb(uri = env.MONGODB_URI) {
  // كل repositories تستخدم اتصال Mongoose هذا؛ MongoDB هو التخزين الدائم
  // للحجوزات والخدمات والحلاقين وساعات العمل.
  mongoose.set('strictQuery', true);
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Several dashboard requests can arrive together on a serverless instance.
  // They share one Atlas handshake rather than starting concurrent connections.
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }

  return connectionPromise;
}

export async function disconnectDb() {
  // يستخدم في الاختبارات والـseed لإغلاق الاتصال بوضوح.
  await mongoose.disconnect();
  connectionPromise = undefined;
}
