/**
 * Shared formatting utilities for WalkerAI.
 */

/** Convert snake_case status to Title Case: "homeowner_approved" → "Homeowner Approved" */
export function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Format cents (integer) to CAD currency string: 150000 → "$1,500" */
export function formatCad(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
