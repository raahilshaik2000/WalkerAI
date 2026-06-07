import { supabase } from '@/lib/supabase/client';
import { formatSupabaseFunctionError } from '@/lib/supabase/functions';

export interface DispatchResult {
  success?: boolean;
  dispatched?: number;
  message?: string;
  [key: string]: unknown;
}

export interface RestartDispatchOptions {
  regenerateSlotsFirst?: boolean;
}

async function invokeDispatch(projectId: string, round: number) {
  const { data, error } = await supabase.functions.invoke<DispatchResult>('dispatch-slots', {
    body: { project_id: projectId, round },
  });
  if (error) throw new Error(await formatSupabaseFunctionError(error));
  return data;
}

async function regenerateTradeSlots(projectId: string) {
  const { error: slotsError } = await supabase.functions.invoke('generate-trade-slots', {
    body: { project_id: projectId },
  });
  if (slotsError) throw new Error(`Slot generation failed: ${await formatSupabaseFunctionError(slotsError)}`);
}

export async function restartProjectDispatch(
  projectId: string,
  round = 4,
  options: RestartDispatchOptions = {},
) {
  await supabase.auth.refreshSession();

  if (options.regenerateSlotsFirst) {
    await regenerateTradeSlots(projectId);
  }

  const firstAttempt = await invokeDispatch(projectId, round);
  if (firstAttempt?.success || !/no slots need dispatch/i.test(firstAttempt?.message ?? '')) {
    return firstAttempt;
  }

  await regenerateTradeSlots(projectId);

  return invokeDispatch(projectId, round);
}
