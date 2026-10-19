// This function lives at the repository root while the server dependencies
// live in server/node_modules. Use explicit relative imports so Vercel traces
// the same production middleware instead of relying on root dependencies.
const express = require('../../server/node_modules/express');
const cors = require('../../server/node_modules/cors');
const helmet = require('../../server/node_modules/helmet');
const { env } = require('../../server/dist/config/env');
const { authRoutes } = require('../../server/dist/routes/auth-routes');
const { errorHandler } = require('../../server/dist/middleware/error-handler');

// Keep the public login endpoint in a small serverless function. It reuses the
// same route, validation, credential comparison, and JWT code as the main API,
// but does not load Mongoose or wait for MongoDB because login has no DB work.
const app = express();
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

module.exports = app;
