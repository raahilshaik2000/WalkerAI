export function formatGcProjectType(projectType?: string | null, roomType?: string | null) {
  const type = projectType || roomType;
  if (!type) return 'Renovation Project';
  const label = type
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  return type === 'kitchen' || type === 'bathroom' ? `${label} Renovation` : label;
}

export function gcProjectTypeIcon(projectType?: string | null, roomType?: string | null) {
  const type = projectType || roomType;
  if (type === 'kitchen') return 'countertop-outline';
  if (type === 'bathroom') return 'shower';
  if (type === 'flooring') return 'floor-plan';
  if (type === 'painting') return 'format-paint';
  if (type === 'basement') return 'home-floor-b';
  if (type === 'addition') return 'home-plus-outline';
  return 'home-edit-outline';
}
