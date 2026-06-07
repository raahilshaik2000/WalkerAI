type ProjectShareInput = {
  title: string;
  statusLabel: string;
  address?: string | null;
  city?: string | null;
  costMinCents?: number | null;
  costMaxCents?: number | null;
};

function formatCadFromCents(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function buildProjectShareMessage(project: ProjectShareInput) {
  const lines = [`${project.title} on WalkerAI`, `Status: ${project.statusLabel}`];

  const location = [project.address, project.city].filter(Boolean).join(', ');
  if (location) {
    lines.push(`Location: ${location}`);
  }

  if (project.costMinCents || project.costMaxCents) {
    const min = project.costMinCents ? formatCadFromCents(project.costMinCents) : 'TBD';
    const max = project.costMaxCents ? formatCadFromCents(project.costMaxCents) : 'TBD';
    lines.push(`Estimated cost: ${min} - ${max}`);
  }

  return lines.join('\n');
}
