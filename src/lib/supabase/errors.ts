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
