# BarberBookingSystem

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.7.

## Development server

The app is split into an Angular frontend and an Express API. Start MongoDB first, then run both with one command:

```bash
npm start
```

`npm start` now starts both the Angular frontend and Express API. If you need
them separately, use `npm run dev:web` and `npm run dev:api`.

The Angular app runs on `http://localhost:4200/` and proxies `/api` to `http://localhost:3001`. The API reads `server/.env`; copy `server/.env.example` if you need a fresh local config.

Important API environment variables:

```bash
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/barber-booking-system
JWT_SECRET=replace-this-with-a-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
CLIENT_ORIGIN=http://localhost:4200
```

## Appointment availability

Each service's duration determines appointment length, with no buffer between
appointments. For each barber, the API subtracts active bookings from the shop's
working hours. Inside each free period it offers consecutive starts spaced by
the selected service's duration, plus a start that finishes exactly at the end
of the period. These are alternative choices: booking one removes overlapping
choices. A 45-minute service in a 10:00–11:00 gap offers 10:00 and 10:15.

Admin and customer bookings use the same working-hour and overlap rules.
Cancelled bookings release their minutes. Existing bookings retain their saved
duration and end time when a service changes. Unique locks per date, barber,
and occupied minute protect concurrent requests. Any-barber bookings retry
another compatible barber when a concurrent request takes the first one.

Shop settings contain working days, opening time, and closing time. Legacy
`slotIntervalMinutes` values in existing documents are ignored; no booking
migration is required. Current-day availability uses `BUSINESS_TIME_ZONE`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
npm --prefix server run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

In production, keep frontend API calls relative to `/api`. You can serve the Angular build from the Express server by setting `NODE_ENV=production` and running the built API, or place both apps behind a reverse proxy on the same domain.

## Vercel deployment

Vercel serves the Angular build and sends `/api/*` to `api/index.ts`, which
initializes the existing Express app and MongoDB connection. Before deploying,
set these **Production** environment variables in the Vercel project (never
commit `server/.env`):

```text
MONGODB_URI=<production MongoDB connection string>
JWT_SECRET=<long random secret, at least 32 characters>
ADMIN_USERNAME=<production admin username>
ADMIN_PASSWORD=<production admin password or bcrypt hash>
CLIENT_ORIGIN=https://<your-project>.vercel.app
BUSINESS_TIME_ZONE=Asia/Jerusalem
```

After the Vercel project has its environment variables, deploy with
`npx vercel --prod`. Use the production Vercel URL as `CLIENT_ORIGIN`; do not
use a wildcard origin.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

For a single frontend run and the API suite:

```bash
npm test -- --watch=false
npm --prefix server test
```

API integration tests create an isolated MongoDB instance using
`mongodb-memory-server`; the first run may download its MongoDB binary. They
do not connect to the configured shop database or send confirmation SMS.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
