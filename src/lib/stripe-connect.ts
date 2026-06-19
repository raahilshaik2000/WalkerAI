import { supabase } from '@/lib/supabase/client';

export type StripeConnectRole = 'company' | 'supplier' | 'general_contractor';

export async function refreshStripeConnectStatus(role: StripeConnectRole = 'company') {
  try {
    const options = role === 'company' ? undefined : { body: { role } };
    const { error } = await supabase.functions.invoke('refresh-connect-status', options);
    return !error;
  } catch {
    return false;
  }
}
