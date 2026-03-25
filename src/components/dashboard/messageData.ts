// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ChatThread {
  id: string;
  projectId: string;
  projectTitle: string;
  projectStatusColor: string;
  contractorName: string;
  contractorAvatar: string;
  isOnline: boolean;
  isSystem: boolean;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'contractor' | 'system';
  senderName: string;
  senderAvatar?: string;
  text: string;
  time: string;
  date: string;
  type: 'text' | 'image' | 'system';
  imageUrl?: string;
  status?: 'sent' | 'delivered' | 'read';
}

// ─── Threads ─────────────────────────────────────────────────────────────────

export const CHAT_THREADS: ChatThread[] = [
  {
    id: 't1',
    projectId: 'f1',
    projectTitle: 'Kitchen Remodel',
    projectStatusColor: '#22C55E',
    contractorName: 'BuildRight Co.',
    contractorAvatar: 'https://i.pravatar.cc/80?img=12',
    isOnline: true,
    isSystem: false,
    lastMessage: 'Sounds good, garage is open. Looking forward to seeing the cabinets in!',
    lastMessageTime: '2m',
    unreadCount: 2,
  },
  {
    id: 't2',
    projectId: 'f2',
    projectTitle: 'Master Bathroom',
    projectStatusColor: '#F59E0B',
    contractorName: 'PremiumFit Inc.',
    contractorAvatar: 'https://i.pravatar.cc/80?img=33',
    isOnline: true,
    isSystem: false,
    lastMessage: 'About $1,800 extra for the heated floor system.',
    lastMessageTime: '1h',
    unreadCount: 1,
  },
  {
    id: 't3',
    projectId: 'f4',
    projectTitle: "Chef's Kitchen",
    projectStatusColor: '#22C55E',
    contractorName: 'Urban Kitchen Studio',
    contractorAvatar: 'https://i.pravatar.cc/80?img=48',
    isOnline: true,
    isSystem: false,
    lastMessage: 'Understood. Please send it over and I\'ll review.',
    lastMessageTime: '3h',
    unreadCount: 1,
  },
  {
    id: 't4',
    projectId: 'f3',
    projectTitle: 'Guest Bathroom',
    projectStatusColor: '#FF6B00',
    contractorName: 'AquaTile Bathrooms',
    contractorAvatar: 'https://i.pravatar.cc/80?img=22',
    isOnline: false,
    isSystem: false,
    lastMessage: 'Don\'t forget to leave a review when you get a chance 😊',
    lastMessageTime: 'Mar 5',
    unreadCount: 0,
  },
  {
    id: 't5',
    projectId: '',
    projectTitle: 'Support',
    projectStatusColor: '#60A5FA',
    contractorName: 'WalkerAI Support',
    contractorAvatar: '',
    isOnline: true,
    isSystem: true,
    lastMessage: 'Welcome to WalkerAI! We\'re here to help with your renovation journey.',
    lastMessageTime: 'Mar 1',
    unreadCount: 0,
  },
];

// ─── Messages ────────────────────────────────────────────────────────────────

export const CHAT_MESSAGES: Record<string, ChatMessage[]> = {
  t1: [
    // Mar 5
    { id: 'c1', sender: 'system', senderName: '', text: 'Project started — Kitchen Remodel', time: '', date: '2026-03-05', type: 'system' },
    { id: 'c2', sender: 'contractor', senderName: 'BuildRight Co.', senderAvatar: 'https://i.pravatar.cc/80?img=12', text: 'Hi! We\'ve completed the demolition phase. Everything is on track.', time: '9:15 AM', date: '2026-03-05', type: 'text' },
    { id: 'c3', sender: 'me', senderName: 'You', text: 'Great to hear! How does the subfloor look?', time: '10:02 AM', date: '2026-03-05', type: 'text', status: 'read' },
    { id: 'c4', sender: 'contractor', senderName: 'BuildRight Co.', senderAvatar: 'https://i.pravatar.cc/80?img=12', text: 'Subfloor is in good shape — no water damage. We can proceed without any extra work there.', time: '10:30 AM', date: '2026-03-05', type: 'text' },
    // Mar 12
    { id: 'c5', sender: 'system', senderName: '', text: 'Milestone "Plumbing & Electrical" completed ✓', time: '', date: '2026-03-12', type: 'system' },
    // Mar 15
    { id: 'c6', sender: 'contractor', senderName: 'BuildRight Co.', senderAvatar: 'https://i.pravatar.cc/80?img=12', text: 'Cabinets arrived today! Starting installation tomorrow morning.', time: '4:45 PM', date: '2026-03-15', type: 'text' },
    { id: 'c7', sender: 'contractor', senderName: 'BuildRight Co.', senderAvatar: 'https://i.pravatar.cc/80?img=12', text: '', time: '4:46 PM', date: '2026-03-15', type: 'image', imageUrl: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=400&q=80' },
    { id: 'c8', sender: 'me', senderName: 'You', text: 'Perfect. Will you need access to the garage for storage?', time: '5:10 PM', date: '2026-03-15', type: 'text', status: 'read' },
    { id: 'c9', sender: 'contractor', senderName: 'BuildRight Co.', senderAvatar: 'https://i.pravatar.cc/80?img=12', text: 'That would be great if possible. Also, the countertop templating is scheduled for next week.', time: '5:22 PM', date: '2026-03-15', type: 'text' },
    // Mar 20
    { id: 'c10', sender: 'system', senderName: '', text: 'Milestone "Cabinet Installation" completed ✓', time: '', date: '2026-03-20', type: 'system' },
    { id: 'c11', sender: 'contractor', senderName: 'BuildRight Co.', senderAvatar: 'https://i.pravatar.cc/80?img=12', text: 'Cabinets are in! Take a look — turned out great.', time: '3:00 PM', date: '2026-03-20', type: 'text' },
    { id: 'c12', sender: 'contractor', senderName: 'BuildRight Co.', senderAvatar: 'https://i.pravatar.cc/80?img=12', text: '', time: '3:01 PM', date: '2026-03-20', type: 'image', imageUrl: 'https://images.unsplash.com/photo-1639173925921-5d5fd027713c?w=400&q=80' },
    { id: 'c13', sender: 'me', senderName: 'You', text: 'Wow, they look amazing! Can\'t wait for the countertops.', time: '3:30 PM', date: '2026-03-20', type: 'text', status: 'delivered' },
  ],
  t2: [
    { id: 'c20', sender: 'system', senderName: '', text: '3 quotes received for Master Bathroom', time: '', date: '2026-03-18', type: 'system' },
    { id: 'c21', sender: 'me', senderName: 'You', text: 'Hi, I received 3 quotes. Can you help me understand the differences?', time: '2:00 PM', date: '2026-03-18', type: 'text', status: 'read' },
    { id: 'c22', sender: 'contractor', senderName: 'PremiumFit Inc.', senderAvatar: 'https://i.pravatar.cc/80?img=33', text: 'Of course! Our quote includes full waterproofing and a heated floor option. Happy to walk you through it.', time: '3:15 PM', date: '2026-03-18', type: 'text' },
    { id: 'c23', sender: 'me', senderName: 'You', text: 'The heated floor sounds nice. What\'s the cost difference?', time: '3:45 PM', date: '2026-03-18', type: 'text', status: 'read' },
    { id: 'c24', sender: 'contractor', senderName: 'PremiumFit Inc.', senderAvatar: 'https://i.pravatar.cc/80?img=33', text: 'About $1,800 extra for the heated floor system. It\'s a 120V electric mat — very efficient.', time: '4:00 PM', date: '2026-03-18', type: 'text' },
    { id: 'c25', sender: 'contractor', senderName: 'PremiumFit Inc.', senderAvatar: 'https://i.pravatar.cc/80?img=33', text: 'Here\'s a reference from a similar bathroom we did last month:', time: '4:02 PM', date: '2026-03-18', type: 'text' },
    { id: 'c26', sender: 'contractor', senderName: 'PremiumFit Inc.', senderAvatar: 'https://i.pravatar.cc/80?img=33', text: '', time: '4:03 PM', date: '2026-03-18', type: 'image', imageUrl: 'https://images.unsplash.com/photo-1721564130821-5ac091ee399c?w=400&q=80' },
  ],
  t3: [
    { id: 'c30', sender: 'system', senderName: '', text: 'Contract signed — Chef\'s Kitchen Upgrade', time: '', date: '2026-04-01', type: 'system' },
    { id: 'c31', sender: 'contractor', senderName: 'Urban Kitchen Studio', senderAvatar: 'https://i.pravatar.cc/80?img=48', text: 'Demolition is underway. We discovered the wall we planned to open has a support beam — we\'ll need to add a header.', time: '10:00 AM', date: '2026-04-10', type: 'text' },
    { id: 'c32', sender: 'me', senderName: 'You', text: 'Will that affect the timeline or cost?', time: '10:30 AM', date: '2026-04-10', type: 'text', status: 'read' },
    { id: 'c33', sender: 'contractor', senderName: 'Urban Kitchen Studio', senderAvatar: 'https://i.pravatar.cc/80?img=48', text: 'About 2 extra days and ~$1,200 for the steel header and engineering. I\'ll send a change order.', time: '11:00 AM', date: '2026-04-10', type: 'text' },
    { id: 'c34', sender: 'system', senderName: '', text: 'Change order received — +$1,200', time: '', date: '2026-04-10', type: 'system' },
    { id: 'c35', sender: 'me', senderName: 'You', text: 'Understood. Please send it over and I\'ll review.', time: '11:15 AM', date: '2026-04-10', type: 'text', status: 'delivered' },
  ],
  t4: [
    { id: 'c40', sender: 'system', senderName: '', text: 'Project completed — Guest Bathroom Refresh ✓', time: '', date: '2026-03-05', type: 'system' },
    { id: 'c41', sender: 'contractor', senderName: 'AquaTile Bathrooms', senderAvatar: 'https://i.pravatar.cc/80?img=22', text: 'Project is complete! Please take a look and let us know if everything meets your expectations.', time: '11:00 AM', date: '2026-03-05', type: 'text' },
    { id: 'c42', sender: 'me', senderName: 'You', text: 'Everything looks amazing! Thank you so much. Love the tile work.', time: '2:30 PM', date: '2026-03-05', type: 'text', status: 'read' },
    { id: 'c43', sender: 'contractor', senderName: 'AquaTile Bathrooms', senderAvatar: 'https://i.pravatar.cc/80?img=22', text: 'Thank you! It was a pleasure working on this. Don\'t forget to leave a review when you get a chance 😊', time: '3:00 PM', date: '2026-03-05', type: 'text' },
  ],
  t5: [
    { id: 'c50', sender: 'contractor', senderName: 'WalkerAI Support', text: 'Welcome to WalkerAI! We\'re here to help with your renovation journey. If you have any questions, just ask.', time: '10:00 AM', date: '2026-03-01', type: 'text' },
    { id: 'c51', sender: 'contractor', senderName: 'WalkerAI Support', text: 'Tip: Upload at least 4 photos of your space for the most accurate AI analysis.', time: '10:01 AM', date: '2026-03-01', type: 'text' },
  ],
};
