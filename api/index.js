const { createApp } = require('../server/dist/app');
const { performance } = require('node:perf_hooks');
const { connectDb } = require('../server/dist/config/db');
const { seedDefaults } = require('../server/dist/services/seed');

const app = createApp();
let initialization;

function initialize() {
  if (!initialization) {
    initialization = (async () => {
      const startedAt = performance.now();
      await connectDb();
      const connectedAt = performance.now();
      await seedDefaults();
      const completedAt = performance.now();

      console.info('Database initialization timings', {
        connectMs: Math.round(connectedAt - startedAt),
        seedMs: Math.round(completedAt - connectedAt),
        totalMs: Math.round(completedAt - startedAt),
      });
    })()
      .catch((error) => {
        // Let a later warm invocation retry after a transient database failure.
        initialization = undefined;
        throw error;
      });
  }

  return initialization;
}

function requestNeedsDatabase(req) {
  const path = (req.url || '').split('?', 1)[0];

  // Login validates configured credentials and signs a JWT; it has no database
  // dependency and must not wait for a cold Atlas connection.
  return path !== '/api/auth/login' && path !== '/api/health';
}

module.exports = async (req, res) => {
  try {
    if (requestNeedsDatabase(req)) {
      await initialize();
    }
    app(req, res);
  } catch (error) {
    console.error('API initialization failed:', error);
    res.status(503).json({ message: 'The service is temporarily unavailable.' });
  }
};
