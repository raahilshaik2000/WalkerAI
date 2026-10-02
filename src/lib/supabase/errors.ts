interface SupabaseLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function isMissingSupabaseSchemaObjectError(
  error: SupabaseLikeError | null | undefined,
  objectName?: string,
) {
  const text = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!text) return false;

  const missingSchemaObject = /schema cache/.test(text)
    || /could not find the (table|column|relationship|function)/.test(text)
    || /relation .* does not exist/.test(text)
    || /column .* does not exist/.test(text);

  if (!missingSchemaObject) return false;
  return objectName ? text.includes(objectName.toLowerCase()) : true;
}

/** User-facing categories used by payment / media / edge-function error mapping. */
export type AppErrorCategory =
  | 'network'
  | 'payment'
  | 'storage'
  | 'edge_function'
  | 'database'
  | 'unknown';

export function categorizeAppErrorMessage(message: string): AppErrorCategory {
  const lower = message.toLowerCase();
  if (
    lower.includes('network')
    || lower.includes('fetch failed')
    || lower.includes('timed out')
    || lower.includes('timeout')
    || lower.includes('offline')
  ) {
    return 'network';
  }
  if (
    lower.includes('stripe')
    || lower.includes('payment')
    || lower.includes('client secret')
    || lower.includes('card was declined')
  ) {
    return 'payment';
  }
  if (lower.includes('storage') || lower.includes('bucket') || lower.includes('payload too large')) {
    return 'storage';
  }
  if (
    lower.includes('edge function')
    || lower.includes('function not found')
    || lower.includes('non-2xx')
  ) {
    return 'edge_function';
  }
  if (
    lower.includes('row-level security')
    || lower.includes('schema cache')
    || lower.includes('permission denied')
    || /column .* does not exist/i.test(message)
  ) {
    return 'database';
  }
  return 'unknown';
}
