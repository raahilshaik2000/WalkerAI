import { buildProjectShareMessage } from '@/lib/project-share';

describe('buildProjectShareMessage', () => {
  it('includes project title, status, location, and estimated cost', () => {
    expect(buildProjectShareMessage({
      title: 'Kitchen Renovation',
      statusLabel: 'In Progress',
      address: '123 King St',
      city: 'Toronto',
      costMinCents: 1250000,
      costMaxCents: 2500000,
    })).toBe([
      'Kitchen Renovation on WalkerAI',
      'Status: In Progress',
      'Location: 123 King St, Toronto',
      'Estimated cost: $12,500 - $25,000',
    ].join('\n'));
  });

  it('omits empty optional fields', () => {
    expect(buildProjectShareMessage({
      title: 'Bathroom Renovation',
      statusLabel: 'Ready to Send',
      address: null,
      city: null,
      costMinCents: null,
      costMaxCents: null,
    })).toBe([
      'Bathroom Renovation on WalkerAI',
      'Status: Ready to Send',
    ].join('\n'));
  });
});
