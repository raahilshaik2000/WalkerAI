// Fake detail data organized by projectId for self-contained detail screens

export interface FakeMilestone {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  status: 'completed' | 'in_progress' | 'pending';
  statusColor: string;
  description: string;
}

export interface FakeMessage {
  id: string;
  sender: 'me' | 'contractor';
  senderName: string;
  text: string;
  time: string;
}

export interface FakeQuote {
  contractorName: string;
  contractorAvatar: string;
  rating: number;
  reviewCount: number;
  totalAmount: number;
  status: 'pending' | 'approved';
  milestones: { title: string; amount: number; dueDate: string }[];
}

export interface FakePermit {
  id: string;
  type: string;
  status: 'not_applied' | 'applied' | 'approved' | 'inspection_scheduled' | 'passed';
  statusStep: number; // 0-4
}

export interface FakeChangeOrder {
  id: string;
  description: string;
  costDelta: number;
  status: 'proposed' | 'approved' | 'rejected';
  contractorSigned: boolean;
  homeownerSigned: boolean;
  createdAt: string;
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export const MILESTONES: Record<string, FakeMilestone[]> = {
  f1: [
    { id: 'm1', title: 'Demolition & Prep', amount: 3200, dueDate: 'Mar 5', status: 'completed', statusColor: '#22C55E', description: 'Remove existing cabinets, countertops, and flooring. Prep walls and subfloor.' },
    { id: 'm2', title: 'Plumbing & Electrical', amount: 4800, dueDate: 'Mar 12', status: 'completed', statusColor: '#22C55E', description: 'Rough-in plumbing for new sink location. Add dedicated circuits for appliances.' },
    { id: 'm3', title: 'Cabinet Installation', amount: 7500, dueDate: 'Mar 20', status: 'completed', statusColor: '#22C55E', description: 'Install base and wall cabinets. Level, shim, and secure to studs.' },
    { id: 'm4', title: 'Countertop & Backsplash', amount: 5200, dueDate: 'Mar 28', status: 'in_progress', statusColor: '#F59E0B', description: 'Template, fabricate, and install quartz countertops. Tile backsplash.' },
    { id: 'm5', title: 'Final Touches & Cleanup', amount: 3800, dueDate: 'Apr 5', status: 'pending', statusColor: '#6B6B6B', description: 'Install fixtures, hardware, appliances. Final inspection and cleanup.' },
  ],
  f2: [
    { id: 'm6', title: 'Design Finalization', amount: 1500, dueDate: 'TBD', status: 'in_progress', statusColor: '#F59E0B', description: 'Finalize tile selections, fixture choices, and layout approval.' },
    { id: 'm7', title: 'Demolition', amount: 2200, dueDate: 'TBD', status: 'pending', statusColor: '#6B6B6B', description: 'Remove existing vanity, shower, tub, and flooring.' },
    { id: 'm8', title: 'Plumbing & Waterproofing', amount: 3800, dueDate: 'TBD', status: 'pending', statusColor: '#6B6B6B', description: 'Relocate drain lines. Waterproof shower pan and walls.' },
    { id: 'm9', title: 'Tile & Fixtures', amount: 4200, dueDate: 'TBD', status: 'pending', statusColor: '#6B6B6B', description: 'Install floor and wall tile. Mount vanity, toilet, and shower fixtures.' },
  ],
  f3: [
    { id: 'm10', title: 'Demolition & Prep', amount: 1800, dueDate: 'Feb 10', status: 'completed', statusColor: '#22C55E', description: 'Remove old vanity and tile. Prep surfaces.' },
    { id: 'm11', title: 'Plumbing Updates', amount: 2200, dueDate: 'Feb 18', status: 'completed', statusColor: '#22C55E', description: 'Replace supply lines and update drain.' },
    { id: 'm12', title: 'Tile & Vanity Install', amount: 3500, dueDate: 'Feb 28', status: 'completed', statusColor: '#22C55E', description: 'Install floor tile, wall tile, and new vanity with mirror.' },
    { id: 'm13', title: 'Final Touches', amount: 1500, dueDate: 'Mar 5', status: 'completed', statusColor: '#22C55E', description: 'Hardware, lighting, accessories. Final walkthrough.' },
  ],
  f4: [
    { id: 'm14', title: 'Design & Procurement', amount: 4500, dueDate: 'Apr 1', status: 'completed', statusColor: '#22C55E', description: 'Finalize design. Order custom cabinets and appliances.' },
    { id: 'm15', title: 'Demolition', amount: 3800, dueDate: 'Apr 10', status: 'in_progress', statusColor: '#F59E0B', description: 'Remove existing kitchen. Prep for new layout.' },
    { id: 'm16', title: 'Structural & Rough-In', amount: 6200, dueDate: 'Apr 22', status: 'pending', statusColor: '#6B6B6B', description: 'Open wall for island. Plumbing, electrical, gas rough-in.' },
    { id: 'm17', title: 'Cabinets & Counters', amount: 12000, dueDate: 'May 8', status: 'pending', statusColor: '#6B6B6B', description: 'Install custom cabinetry and stone countertops.' },
    { id: 'm18', title: 'Appliances & Finish', amount: 8500, dueDate: 'May 20', status: 'pending', statusColor: '#6B6B6B', description: 'Install professional appliances. Backsplash, paint, hardware.' },
  ],
  f5: [
    { id: 'm19', title: 'Planning & Design', amount: 800, dueDate: 'TBD', status: 'pending', statusColor: '#6B6B6B', description: 'Select fixtures, tile, and paint colors.' },
    { id: 'm20', title: 'Demolition & Install', amount: 2800, dueDate: 'TBD', status: 'pending', statusColor: '#6B6B6B', description: 'Remove old fixtures. Install new vanity, toilet, and mirror.' },
    { id: 'm21', title: 'Final Touches', amount: 900, dueDate: 'TBD', status: 'pending', statusColor: '#6B6B6B', description: 'Paint, hardware, accessories. Final cleanup.' },
  ],
};

// ─── Messages ────────────────────────────────────────────────────────────────

export const MESSAGES: Record<string, FakeMessage[]> = {
  f1: [
    { id: 'msg1', sender: 'contractor', senderName: 'BuildRight Co.', text: 'Hi! We\'ve completed the demolition phase. Everything is on track.', time: 'Mar 5, 9:15 AM' },
    { id: 'msg2', sender: 'me', senderName: 'You', text: 'Great to hear! How does the subfloor look?', time: 'Mar 5, 10:02 AM' },
    { id: 'msg3', sender: 'contractor', senderName: 'BuildRight Co.', text: 'Subfloor is in good shape — no water damage. We can proceed without any extra work there.', time: 'Mar 5, 10:30 AM' },
    { id: 'msg4', sender: 'contractor', senderName: 'BuildRight Co.', text: 'Cabinets arrived today! Starting installation tomorrow morning.', time: 'Mar 15, 4:45 PM' },
    { id: 'msg5', sender: 'me', senderName: 'You', text: 'Perfect. Will you need access to the garage for storage?', time: 'Mar 15, 5:10 PM' },
    { id: 'msg6', sender: 'contractor', senderName: 'BuildRight Co.', text: 'That would be great if possible. Also, the countertop templating is scheduled for next week.', time: 'Mar 15, 5:22 PM' },
    { id: 'msg7', sender: 'me', senderName: 'You', text: 'Sounds good, garage is open. Looking forward to seeing the cabinets in!', time: 'Mar 15, 5:30 PM' },
  ],
  f2: [
    { id: 'msg8', sender: 'me', senderName: 'You', text: 'Hi, I received 3 quotes. Can you help me understand the differences?', time: 'Mar 18, 2:00 PM' },
    { id: 'msg9', sender: 'contractor', senderName: 'PremiumFit Inc.', text: 'Of course! Our quote includes full waterproofing and a heated floor option. Happy to walk you through it.', time: 'Mar 18, 3:15 PM' },
    { id: 'msg10', sender: 'me', senderName: 'You', text: 'The heated floor sounds nice. What\'s the cost difference?', time: 'Mar 18, 3:45 PM' },
    { id: 'msg11', sender: 'contractor', senderName: 'PremiumFit Inc.', text: 'About $1,800 extra for the heated floor system. It\'s a 120V electric mat — very efficient.', time: 'Mar 18, 4:00 PM' },
  ],
  f3: [
    { id: 'msg12', sender: 'contractor', senderName: 'AquaTile Bathrooms', text: 'Project is complete! Please take a look and let us know if everything meets your expectations.', time: 'Mar 5, 11:00 AM' },
    { id: 'msg13', sender: 'me', senderName: 'You', text: 'Everything looks amazing! Thank you so much. Love the tile work.', time: 'Mar 5, 2:30 PM' },
    { id: 'msg14', sender: 'contractor', senderName: 'AquaTile Bathrooms', text: 'Thank you! It was a pleasure working on this. Don\'t forget to leave a review when you get a chance 😊', time: 'Mar 5, 3:00 PM' },
  ],
  f4: [
    { id: 'msg15', sender: 'contractor', senderName: 'Urban Kitchen Studio', text: 'Demolition is underway. We discovered the wall we planned to open has a support beam — we\'ll need to add a header.', time: 'Apr 10, 10:00 AM' },
    { id: 'msg16', sender: 'me', senderName: 'You', text: 'Will that affect the timeline or cost?', time: 'Apr 10, 10:30 AM' },
    { id: 'msg17', sender: 'contractor', senderName: 'Urban Kitchen Studio', text: 'About 2 extra days and ~$1,200 for the steel header and engineering. I\'ll send a change order.', time: 'Apr 10, 11:00 AM' },
    { id: 'msg18', sender: 'me', senderName: 'You', text: 'Understood. Please send it over and I\'ll review.', time: 'Apr 10, 11:15 AM' },
  ],
  f5: [],
};

// ─── Quotes ──────────────────────────────────────────────────────────────────

export const QUOTES: Record<string, FakeQuote | null> = {
  f1: {
    contractorName: 'BuildRight Co.',
    contractorAvatar: 'https://i.pravatar.cc/80?img=12',
    rating: 4.9,
    reviewCount: 127,
    totalAmount: 24500,
    status: 'approved',
    milestones: [
      { title: 'Demolition & Prep', amount: 3200, dueDate: 'Mar 5' },
      { title: 'Plumbing & Electrical', amount: 4800, dueDate: 'Mar 12' },
      { title: 'Cabinet Installation', amount: 7500, dueDate: 'Mar 20' },
      { title: 'Countertop & Backsplash', amount: 5200, dueDate: 'Mar 28' },
      { title: 'Final Touches & Cleanup', amount: 3800, dueDate: 'Apr 5' },
    ],
  },
  f2: {
    contractorName: 'PremiumFit Inc.',
    contractorAvatar: 'https://i.pravatar.cc/80?img=33',
    rating: 4.8,
    reviewCount: 93,
    totalAmount: 13500,
    status: 'pending',
    milestones: [
      { title: 'Design Finalization', amount: 1500, dueDate: 'TBD' },
      { title: 'Demolition', amount: 2200, dueDate: 'TBD' },
      { title: 'Plumbing & Waterproofing', amount: 3800, dueDate: 'TBD' },
      { title: 'Tile & Fixtures', amount: 4200, dueDate: 'TBD' },
      { title: 'Cleanup & Walkthrough', amount: 1800, dueDate: 'TBD' },
    ],
  },
  f3: {
    contractorName: 'AquaTile Bathrooms',
    contractorAvatar: 'https://i.pravatar.cc/80?img=22',
    rating: 4.6,
    reviewCount: 41,
    totalAmount: 9000,
    status: 'approved',
    milestones: [
      { title: 'Demolition & Prep', amount: 1800, dueDate: 'Feb 10' },
      { title: 'Plumbing Updates', amount: 2200, dueDate: 'Feb 18' },
      { title: 'Tile & Vanity Install', amount: 3500, dueDate: 'Feb 28' },
      { title: 'Final Touches', amount: 1500, dueDate: 'Mar 5' },
    ],
  },
  f4: {
    contractorName: 'Urban Kitchen Studio',
    contractorAvatar: 'https://i.pravatar.cc/80?img=48',
    rating: 4.9,
    reviewCount: 156,
    totalAmount: 35000,
    status: 'approved',
    milestones: [
      { title: 'Design & Procurement', amount: 4500, dueDate: 'Apr 1' },
      { title: 'Demolition', amount: 3800, dueDate: 'Apr 10' },
      { title: 'Structural & Rough-In', amount: 6200, dueDate: 'Apr 22' },
      { title: 'Cabinets & Counters', amount: 12000, dueDate: 'May 8' },
      { title: 'Appliances & Finish', amount: 8500, dueDate: 'May 20' },
    ],
  },
  f5: null,
};

// ─── Permits ─────────────────────────────────────────────────────────────────

export const PERMITS: Record<string, FakePermit[]> = {
  f1: [
    { id: 'pm1', type: 'Building Permit', status: 'approved', statusStep: 2 },
    { id: 'pm2', type: 'Electrical Permit', status: 'inspection_scheduled', statusStep: 3 },
    { id: 'pm3', type: 'Plumbing Permit', status: 'passed', statusStep: 4 },
  ],
  f2: [
    { id: 'pm4', type: 'Building Permit', status: 'not_applied', statusStep: 0 },
    { id: 'pm5', type: 'Plumbing Permit', status: 'not_applied', statusStep: 0 },
  ],
  f3: [
    { id: 'pm6', type: 'Building Permit', status: 'passed', statusStep: 4 },
    { id: 'pm7', type: 'Plumbing Permit', status: 'passed', statusStep: 4 },
  ],
  f4: [
    { id: 'pm8', type: 'Building Permit', status: 'approved', statusStep: 2 },
    { id: 'pm9', type: 'Electrical Permit', status: 'applied', statusStep: 1 },
    { id: 'pm10', type: 'Gas Permit', status: 'applied', statusStep: 1 },
  ],
  f5: [],
};

// ─── Change Orders ───────────────────────────────────────────────────────────

export const CHANGE_ORDERS: Record<string, FakeChangeOrder[]> = {
  f1: [
    {
      id: 'co1',
      description: 'Upgrade to quartz backsplash instead of ceramic tile',
      costDelta: 1200,
      status: 'approved',
      contractorSigned: true,
      homeownerSigned: true,
      createdAt: 'Mar 14',
    },
  ],
  f2: [],
  f3: [],
  f4: [
    {
      id: 'co2',
      description: 'Add steel header beam for wall removal (structural requirement)',
      costDelta: 1200,
      status: 'proposed',
      contractorSigned: true,
      homeownerSigned: false,
      createdAt: 'Apr 10',
    },
    {
      id: 'co3',
      description: 'Upgrade range hood to 900 CFM professional model',
      costDelta: 850,
      status: 'proposed',
      contractorSigned: true,
      homeownerSigned: false,
      createdAt: 'Apr 12',
    },
  ],
  f5: [],
};
