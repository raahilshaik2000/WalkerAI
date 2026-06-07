// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  route: string;
  color: string;
}

export type InspirationCategory = 'photos' | 'ai_render' | 'pro_work';

export interface InspirationItem {
  id: string;
  imageUrl: string;
  images: string[];
  title: string;
  category: InspirationCategory;
  categoryLabel: string;
  categoryColor: string;
}

export interface NewsItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBgColor: string;
  tag: 'new' | 'tip' | 'update' | 'seasonal';
  tagColor: string;
}

export interface RoomTypePick {
  id: string;
  label: string;
  icon: string;
}

// ─── Dashboard Data ─────────────────────────────────────────────────────────

export const ROOM_TYPE_PICKS: RoomTypePick[] = [
  { id: 'kitchen', label: 'Kitchen', icon: 'restaurant-outline' },
  { id: 'bathroom', label: 'Bathroom', icon: 'water-outline' },
];

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'estimate', label: 'Get Estimate', icon: 'calculator-outline', route: 'ProjectCreate', color: '#FF6B00' },
  { id: 'diy', label: 'DIY Guide', icon: 'hammer-outline', route: 'DIYCreate', color: '#34D399' },
  { id: 'ideas', label: 'Browse Ideas', icon: 'images-outline', route: 'BrowseIdeas', color: '#A78BFA' },
  { id: 'schedule', label: 'My Schedule', icon: 'calendar-outline', route: 'Schedule', color: '#60A5FA' },
  { id: 'measure', label: 'Measure Room', icon: 'scan-outline', route: 'RoomScan', color: '#06B6D4' },
];

export const INSPIRATION_ITEMS: InspirationItem[] = [
  {
    id: 'i1',
    imageUrl: 'https://images.unsplash.com/photo-1745151469070-24c9e2fb2058?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1745151469070-24c9e2fb2058?w=600&q=80',
      'https://images.unsplash.com/photo-1639173925921-5d5fd027713c?w=600&q=80',
      'https://images.unsplash.com/photo-1649083048597-d7b4f1e8a386?w=600&q=80',
    ],
    title: 'Modern White Kitchen',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
  },
  {
    id: 'i2',
    imageUrl: 'https://images.unsplash.com/photo-1754522711595-84428937b07a?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1754522711595-84428937b07a?w=600&q=80',
      'https://images.unsplash.com/photo-1760546120487-ccb54df9838c?w=600&q=80',
      'https://images.unsplash.com/photo-1753605788101-04d1e653e74a?w=600&q=80',
    ],
    title: 'Luxury Bathroom Concept',
    category: 'ai_render',
    categoryLabel: 'Concept',
    categoryColor: '#A78BFA',
  },
  {
    id: 'i3',
    imageUrl: 'https://images.unsplash.com/photo-1641584191698-3f7e03e245b6?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1641584191698-3f7e03e245b6?w=600&q=80',
      'https://images.unsplash.com/photo-1755272853203-1469840c4c60?w=600&q=80',
      'https://images.unsplash.com/photo-1709747820806-057272eddd5d?w=600&q=80',
    ],
    title: 'Industrial Kitchen Reno',
    category: 'pro_work',
    categoryLabel: 'Pro Work',
    categoryColor: '#FF6B00',
  },
  {
    id: 'i4',
    imageUrl: 'https://images.unsplash.com/photo-1753605788101-04d1e653e74a?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1753605788101-04d1e653e74a?w=600&q=80',
      'https://images.unsplash.com/photo-1722650271096-bf3af586c406?w=600&q=80',
    ],
    title: 'Spa-Style Bathroom',
    category: 'ai_render',
    categoryLabel: 'Concept',
    categoryColor: '#A78BFA',
  },
  {
    id: 'i5',
    imageUrl: 'https://images.unsplash.com/photo-1709747820806-057272eddd5d?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1709747820806-057272eddd5d?w=600&q=80',
      'https://images.unsplash.com/photo-1649083048597-d7b4f1e8a386?w=600&q=80',
      'https://images.unsplash.com/photo-1639173925921-5d5fd027713c?w=600&q=80',
    ],
    title: 'Marble Countertop Install',
    category: 'pro_work',
    categoryLabel: 'Pro Work',
    categoryColor: '#FF6B00',
  },
  {
    id: 'i6',
    imageUrl: 'https://images.unsplash.com/photo-1722650271096-bf3af586c406?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1722650271096-bf3af586c406?w=600&q=80',
      'https://images.unsplash.com/photo-1760546120487-ccb54df9838c?w=600&q=80',
    ],
    title: 'Walk-In Shower Remodel',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
  },
];

export const NEWS_ITEMS: NewsItem[] = [
  {
    id: 'n1',
    title: 'AI Photo Analysis Now Available',
    subtitle: 'Upload photos and get instant renovation insights powered by AI.',
    icon: 'sparkles',
    iconBgColor: '#A78BFA',
    tag: 'new',
    tagColor: '#22C55E',
  },
  {
    id: 'n2',
    title: 'Kitchen Trends for 2026',
    subtitle: 'Waterfall islands, integrated appliances, and matte finishes are in.',
    icon: 'trending-up-outline',
    iconBgColor: '#F59E0B',
    tag: 'tip',
    tagColor: '#F59E0B',
  },
  {
    id: 'n3',
    title: 'Milestone Payments Update',
    subtitle: 'Pay contractors securely as milestones are completed and verified.',
    icon: 'shield-checkmark-outline',
    iconBgColor: '#FF6B00',
    tag: 'update',
    tagColor: '#60A5FA',
  },
];

// ─── Extended Inspiration (for gallery) ──────────────────────────────────────

export const ALL_INSPIRATION_ITEMS: InspirationItem[] = [
  ...INSPIRATION_ITEMS,
  {
    id: 'i7',
    imageUrl: 'https://images.unsplash.com/photo-1755272853203-1469840c4c60?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1755272853203-1469840c4c60?w=600&q=80',
      'https://images.unsplash.com/photo-1745151469070-24c9e2fb2058?w=600&q=80',
    ],
    title: 'Farmhouse Kitchen Sink',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
  },
  {
    id: 'i8',
    imageUrl: 'https://images.unsplash.com/photo-1564540579594-0930edb6de43?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1564540579594-0930edb6de43?w=600&q=80',
      'https://images.unsplash.com/photo-1754522711595-84428937b07a?w=600&q=80',
    ],
    title: 'Double Vanity Concept',
    category: 'ai_render',
    categoryLabel: 'Concept',
    categoryColor: '#A78BFA',
  },
  {
    id: 'i9',
    imageUrl: 'https://images.unsplash.com/photo-1649083048597-d7b4f1e8a386?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1649083048597-d7b4f1e8a386?w=600&q=80',
      'https://images.unsplash.com/photo-1641584191698-3f7e03e245b6?w=600&q=80',
    ],
    title: 'Quartz Kitchen Island',
    category: 'pro_work',
    categoryLabel: 'Pro Work',
    categoryColor: '#FF6B00',
  },
  {
    id: 'i10',
    imageUrl: 'https://images.unsplash.com/photo-1760546120487-ccb54df9838c?w=400&q=80',
    images: [
      'https://images.unsplash.com/photo-1760546120487-ccb54df9838c?w=600&q=80',
      'https://images.unsplash.com/photo-1722650271096-bf3af586c406?w=600&q=80',
    ],
    title: 'Freestanding Bathtub',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
  },
];

// ─── News Detail Content ─────────────────────────────────────────────────────

export const NEWS_DETAIL_CONTENT: Record<string, string> = {
  n1: 'Our new AI Photo Analysis feature lets you upload photos of your kitchen or bathroom and receive instant insights. The AI identifies existing materials, layout characteristics, and structural elements — giving you a detailed breakdown before you even talk to a contractor.\n\nSimply snap 4+ photos of your space, and our AI will analyze cabinet condition, countertop materials, flooring type, fixture age, and more. This powers smarter contractor matching and more accurate estimates.\n\nTry it now by creating a new project and uploading your photos.',
  n2: 'Kitchen design is evolving fast in 2026. Here are the top trends our contractors are seeing:\n\n• Waterfall islands with book-matched stone are replacing standard edges\n• Integrated appliances with panel-ready fronts create seamless cabinetry\n• Matte finishes in black and forest green are overtaking glossy whites\n• Under-cabinet LED strips with warm dimming for ambient lighting\n• Pot-filler faucets over the range are making a strong comeback\n\nPlanning a kitchen reno? Start a project to get matched with specialists who know these trends.',
  n3: 'We\'ve updated how milestone payments work to make them even safer for homeowners.\n\nWhen a contractor marks a milestone as complete, you\'ll receive a notification to review the work and release payment from escrow. Payment is only released after your approval.\n\nIf anything looks off, you can flag the milestone for review. Payment release pauses while the dispute is active, so the issue can be resolved before funds move.',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
