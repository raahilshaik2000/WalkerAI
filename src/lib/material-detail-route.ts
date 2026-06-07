export type MaterialQualityTier = 'budget' | 'mid-range' | 'luxury';

export type MaterialDetailRouteParams = {
  materialIndex: number;
  materialName: string;
  materialQualityTier?: MaterialQualityTier;
  quantity: number;
  unit: string;
};

const QUALITY_TIERS = new Set<MaterialQualityTier>(['budget', 'mid-range', 'luxury']);

export function parseMaterialDetailRouteParams(value: unknown): MaterialDetailRouteParams | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const params = value as Record<string, unknown>;
  const materialIndex = params.materialIndex;
  const materialName = params.materialName;
  const materialQualityTier = params.materialQualityTier;
  const quantity = params.quantity;
  const unit = params.unit;

  if (typeof materialIndex !== 'number' || !Number.isInteger(materialIndex) || materialIndex < 0) {
    return null;
  }

  if (typeof materialName !== 'string' || !materialName.trim()) {
    return null;
  }

  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  if (typeof unit !== 'string' || !unit.trim()) {
    return null;
  }

  if (
    materialQualityTier !== undefined &&
    (typeof materialQualityTier !== 'string' || !QUALITY_TIERS.has(materialQualityTier as MaterialQualityTier))
  ) {
    return null;
  }

  return {
    materialIndex,
    materialName: materialName.trim(),
    materialQualityTier: materialQualityTier as MaterialQualityTier | undefined,
    quantity,
    unit: unit.trim(),
  };
}
