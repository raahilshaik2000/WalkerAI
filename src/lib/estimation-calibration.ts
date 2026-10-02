import { supabase } from '@/lib/supabase/client';
import type { EstimationLearningRecord } from '@/types/database.types';

export interface CalibrationSummary {
  sampleSize: number;
  averageVarianceRatio: number;
  recommendedAreaMultiplier: number;
  averageLaborDiffCadCents: number;
  commonCategories: Array<{ category: string; count: number }>;
}

/**
 * Fetch verified Head-Office-approved historical learning records
 * for a specific room type and province to calibrate future estimates.
 */
export async function fetchHistoricalCalibrationRecords(
  roomType: string,
  province: string,
): Promise<EstimationLearningRecord[]> {
  try {
    const { data, error } = await supabase
      .from('estimation_learning_records')
      .select('*')
      .eq('room_type', roomType)
      .eq('province', province)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Could not fetch estimation learning records:', error);
      return [];
    }

    return (data ?? []) as EstimationLearningRecord[];
  } catch (err) {
    console.warn('fetchHistoricalCalibrationRecords exception:', err);
    return [];
  }
}

/**
 * Compute aggregate calibration factors from historical verified inspection data.
 */
export function computeCalibrationSummary(records: EstimationLearningRecord[]): CalibrationSummary {
  if (!records || records.length === 0) {
    return {
      sampleSize: 0,
      averageVarianceRatio: 1.0,
      recommendedAreaMultiplier: 1.0,
      averageLaborDiffCadCents: 0,
      commonCategories: [],
    };
  }

  const sampleSize = records.length;
  const totalVariance = records.reduce((sum, r) => sum + (Number(r.dimensional_variance_ratio) || 1.0), 0);
  const avgVariance = totalVariance / sampleSize;

  const totalLaborDiff = records.reduce((sum, r) => sum + (Number(r.approved_cost_delta_cents) || 0), 0);
  const avgLaborDiff = Math.round(totalLaborDiff / sampleSize);

  // Group by adjustment category
  const categoryCounts: Record<string, number> = {};
  for (const r of records) {
    const cat = r.adjustment_category || 'other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const commonCategories = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    sampleSize,
    averageVarianceRatio: Number(avgVariance.toFixed(4)),
    recommendedAreaMultiplier: Number(avgVariance.toFixed(4)),
    averageLaborDiffCadCents: avgLaborDiff,
    commonCategories,
  };
}

/**
 * Apply learned historical calibration factor to baseline project costs.
 */
export function applyCalibrationToCostEstimate(
  baseCostMinCadCents: number,
  baseCostMaxCadCents: number,
  calibration: CalibrationSummary,
): { minCadCents: number; maxCadCents: number; confidenceNotes: string[] } {
  if (calibration.sampleSize < 3) {
    return {
      minCadCents: baseCostMinCadCents,
      maxCadCents: baseCostMaxCadCents,
      confidenceNotes: ['Estimate uses deterministic regional baseline (learning dataset building).'],
    };
  }

  // Bound adjustment to a safe ±15% calibration envelope
  const boundedMultiplier = Math.min(1.15, Math.max(0.85, calibration.recommendedAreaMultiplier));
  const minCadCents = Math.round(baseCostMinCadCents * boundedMultiplier);
  const maxCadCents = Math.round(baseCostMaxCadCents * boundedMultiplier);

  const notes = [
    `Calibrated against ${calibration.sampleSize} verified completed site inspections in your region.`,
  ];

  if (calibration.commonCategories.length > 0) {
    const topCat = calibration.commonCategories[0].category.replace(/_/g, ' ');
    notes.push(`Allowances account for verified ${topCat} rough-in patterns.`);
  }

  return {
    minCadCents,
    maxCadCents,
    confidenceNotes: notes,
  };
}
