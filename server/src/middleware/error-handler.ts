import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http-error';
import { formatStrictValidationError } from '../validation/strict-payload';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message, details: error.details });
    return;
  }

  if (error instanceof ZodError) {
    const details = formatStrictValidationError(error, req.method === 'GET' ? req.query : req.body);
    res.status(400).json({
      message: details.issues.map(issue => issue.message).join(' '),
      details
    });
    return;
  }

  res.status(500).json({ message: 'Internal server error.' });
};
