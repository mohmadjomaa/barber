import { z, ZodError, type ZodRawShape } from 'zod';

/**
 * هذه الدوال تتحقق من نوع البيانات كما أُرسل تماماً، ولا تحوّل القيم تلقائياً.
 * مثال: لا نقبل `"12"` مكان integer، ولا نقبل `12` مكان string. هذا يمنع
 * أن يخفي التحويل التلقائي خطأً في طلب API من الواجهة أو من أي عميل آخر.
 */
export const strictString = () => z.string();
export const strictInteger = () =>
  z.number({ error: 'Expected integer' }).int({ error: 'Expected integer' });
export const strictObject = <Shape extends ZodRawShape>(shape: Shape) => z.object(shape).strict();

interface ValidationIssue {
  field: string;
  expected: string;
  receivedType: string;
  receivedValue: string;
  reason: string;
  message: string;
}

export interface StrictValidationDetails {
  fields: Record<string, string[]>;
  issues: ValidationIssue[];
}

export function formatStrictValidationError(
  error: ZodError,
  payload: unknown,
): StrictValidationDetails {
  const issues = error.issues.map((issue) => {
    const field = issue.path.length ? issue.path.join('.') : 'payload';
    const input = getValueAtPath(payload, issue.path);
    const received = describeValue(input);
    const expected = expectedType(issue);
    const reason = validationReason(issue.code, expected);
    const message =
      issue.code === 'custom'
        ? `${field}: ${issue.message}`
        : `${field}: Expected ${withArticle(expected)}, but received ${withArticle(received.type)} (${received.value}). Reason: ${reason}`;

    return {
      field,
      expected,
      receivedType: received.type,
      receivedValue: received.value,
      reason,
      message,
    };
  });

  return {
    fields: issues.reduce<Record<string, string[]>>((result, issue) => {
      (result[issue.field] ??= []).push(issue.message);
      return result;
    }, {}),
    issues,
  };
}

function expectedType(issue: ZodError['issues'][number]) {
  if (issue.message === 'Expected integer') {
    return 'integer';
  }

  const expected = (issue as { expected?: unknown }).expected;

  if (expected === 'int') {
    return 'integer';
  }

  if (typeof expected === 'string') {
    return expected;
  }

  return 'valid value';
}

function validationReason(code: string, expected: string) {
  if (code === 'invalid_type') {
    return expected === 'integer'
      ? 'Only whole numbers are accepted; automatic type conversion is disabled.'
      : 'Automatic type conversion is disabled.';
  }

  if (code === 'unrecognized_keys') {
    return 'This field is not allowed in the request payload.';
  }

  return 'The value does not meet this field’s validation rules.';
}

function getValueAtPath(payload: unknown, path: PropertyKey[]) {
  let current = payload;

  for (const segment of path) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<PropertyKey, unknown>)[segment];
  }

  return current;
}

function describeValue(value: unknown) {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

  if (type === 'string') {
    return { type, value: JSON.stringify(value) };
  }

  if (type === 'undefined') {
    return { type, value: 'undefined' };
  }

  try {
    return { type, value: JSON.stringify(value) };
  } catch {
    return { type, value: String(value) };
  }
}

function withArticle(type: string) {
  return /^[aeiou]/i.test(type) ? `an ${type}` : `a ${type}`;
}
