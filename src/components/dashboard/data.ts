import { ProjectStatus, RoomType } from '@/constants/enums';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DashboardProject {
  id: string;
  title: string;
  address: string;
  status: ProjectStatus;
  statusLabel: string;
  statusColor: string;
  progress: number;
  contractor: string;
  contractorAvatar: string | null;
  coverImage: string;
  budget: string;
  dueDate: string;
  roomType: RoomType;
  milestonesTotal: number;
  milestonesCompleted: number;
}

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
  title: string;
  category: InspirationCategory;
  categoryLabel: string;
  categoryColor: string;
  saves: number;
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

export interface ActivityItem {
  id: string;
  icon: string;
  iconColor: string;
  text: string;
  time: string;
  route?: string;
  projectId?: string;
}

export interface RoomTypePick {
  id: string;
  label: string;
  icon: string;
}

// ─── Fake Data ───────────────────────────────────────────────────────────────

export const ROOM_TYPE_PICKS: RoomTypePick[] = [
  { id: 'kitchen', label: 'Kitchen', icon: 'restaurant-outline' },
  { id: 'bathroom', label: 'Bathroom', icon: 'water-outline' },
];

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'find-pro', label: 'Find a Pro', icon: 'search', route: 'FindPro', color: '#FFFFFF' },
  { id: 'estimate', label: 'Get Estimate', icon: 'calculator-outline', route: 'ProjectCreate', color: '#06C167' },
  { id: 'ideas', label: 'Browse Ideas', icon: 'images-outline', route: 'BrowseIdeas', color: '#A78BFA' },
  { id: 'schedule', label: 'My Schedule', icon: 'calendar-outline', route: 'Schedule', color: '#60A5FA' },
];

export const PROJECTS_LIST: DashboardProject[] = [
  {
    id: 'f1',
    title: 'Kitchen Remodel',
    address: '142 Maple St, Toronto',
    status: 'active',
    statusLabel: 'In Progress',
    statusColor: '#22C55E',
    progress: 0.6,
    contractor: 'BuildRight Co.',
    contractorAvatar: 'https://i.pravatar.cc/40?img=12',
    coverImage: 'https://images.unsplash.com/photo-1639173925921-5d5fd027713c?w=600&q=80',
    budget: '$24,500',
    dueDate: 'Mar 28',
    roomType: 'kitchen',
    milestonesTotal: 5,
    milestonesCompleted: 3,
  },
  {
    id: 'f2',
    title: 'Master Bathroom',
    address: '142 Maple St, Toronto',
    status: 'quoting',
    statusLabel: 'Quoting',
    statusColor: '#F59E0B',
    progress: 0.2,
    contractor: '3 bids received',
    contractorAvatar: null,
    coverImage: 'https://images.unsplash.com/photo-1721564130821-5ac091ee399c?w=600&q=80',
    budget: '$11,200–$15,800',
    dueDate: 'TBD',
    roomType: 'bathroom',
    milestonesTotal: 4,
    milestonesCompleted: 0,
  },
  {
    id: 'f3',
    title: 'Guest Bathroom Refresh',
    address: '88 Oak Ave, Mississauga',
    status: 'completed',
    statusLabel: 'Completed',
    statusColor: '#06C167',
    progress: 1.0,
    contractor: 'AquaTile Bathrooms',
    contractorAvatar: 'https://i.pravatar.cc/40?img=22',
    coverImage: 'https://images.unsplash.com/photo-1753605788101-04d1e653e74a?w=600&q=80',
    budget: '$9,000',
    dueDate: 'Mar 5',
    roomType: 'bathroom',
    milestonesTotal: 4,
    milestonesCompleted: 4,
  },
  {
    id: 'f4',
    title: "Chef's Kitchen Upgrade",
    address: '310 King St W, Toronto',
    status: 'active',
    statusLabel: 'In Progress',
    statusColor: '#22C55E',
    progress: 0.35,
    contractor: 'Urban Kitchen Studio',
    contractorAvatar: 'https://i.pravatar.cc/40?img=48',
    coverImage: 'https://images.unsplash.com/photo-1641584191698-3f7e03e245b6?w=600&q=80',
    budget: '$35,000',
    dueDate: 'May 20',
    roomType: 'kitchen',
    milestonesTotal: 5,
    milestonesCompleted: 1,
  },
  {
    id: 'f5',
    title: 'Powder Room Renovation',
    address: '142 Maple St, Toronto',
    status: 'draft',
    statusLabel: 'Draft',
    statusColor: '#6B6B6B',
    progress: 0.05,
    contractor: 'Not assigned',
    contractorAvatar: null,
    coverImage: 'https://images.unsplash.com/photo-1564540579594-0930edb6de43?w=600&q=80',
    budget: 'TBD',
    dueDate: 'TBD',
    roomType: 'bathroom',
    milestonesTotal: 0,
    milestonesCompleted: 0,
  },
];

// Dashboard shows first 2-3 active/quoting projects
export const FAKE_PROJECTS = PROJECTS_LIST.filter(
  (p) => p.status === 'active' || p.status === 'quoting',
);

export const INSPIRATION_ITEMS: InspirationItem[] = [
  {
    id: 'i1',
    imageUrl: 'https://images.unsplash.com/photo-1745151469070-24c9e2fb2058?w=400&q=80',
    title: 'Modern White Kitchen',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
    saves: 1243,
  },
  {
    id: 'i2',
    imageUrl: 'https://images.unsplash.com/photo-1754522711595-84428937b07a?w=400&q=80',
    title: 'AI Luxury Bathroom',
    category: 'ai_render',
    categoryLabel: 'AI Design',
    categoryColor: '#A78BFA',
    saves: 876,
  },
  {
    id: 'i3',
    imageUrl: 'https://images.unsplash.com/photo-1641584191698-3f7e03e245b6?w=400&q=80',
    title: 'Industrial Kitchen Reno',
    category: 'pro_work',
    categoryLabel: 'Pro Work',
    categoryColor: '#06C167',
    saves: 2105,
  },
  {
    id: 'i4',
    imageUrl: 'https://images.unsplash.com/photo-1753605788101-04d1e653e74a?w=400&q=80',
    title: 'Spa-Style Bathroom',
    category: 'ai_render',
    categoryLabel: 'AI Design',
    categoryColor: '#A78BFA',
    saves: 654,
  },
  {
    id: 'i5',
    imageUrl: 'https://images.unsplash.com/photo-1709747820806-057272eddd5d?w=400&q=80',
    title: 'Marble Countertop Install',
    category: 'pro_work',
    categoryLabel: 'Pro Work',
    categoryColor: '#06C167',
    saves: 932,
  },
  {
    id: 'i6',
    imageUrl: 'https://images.unsplash.com/photo-1722650271096-bf3af586c406?w=400&q=80',
    title: 'Walk-In Shower Remodel',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
    saves: 1587,
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
    iconBgColor: '#06C167',
    tag: 'update',
    tagColor: '#60A5FA',
  },
];

export const FAKE_ACTIVITY: ActivityItem[] = [
  {
    id: 'a1',
    icon: 'chatbubble',
    iconColor: '#FFFFFF',
    text: 'BuildRight Co. sent you a message',
    time: '10m ago',
    route: 'Messages',
    projectId: 'f1',
  },
  {
    id: 'a2',
    icon: 'checkmark-circle',
    iconColor: '#22C55E',
    text: 'Milestone "Demolition" completed',
    time: '2h ago',
    route: 'ProjectDetail',
    projectId: 'f1',
  },
  {
    id: 'a3',
    icon: 'document-text',
    iconColor: '#F59E0B',
    text: 'New quote from PremiumFit Inc.',
    time: 'Yesterday',
    route: 'ProjectDetail',
    projectId: 'f2',
  },
  {
    id: 'a4',
    icon: 'camera',
    iconColor: '#A78BFA',
    text: 'AI analysis ready for Bathroom project',
    time: 'Yesterday',
    route: 'ProjectDetail',
    projectId: 'f2',
  },
];

// ─── New Interfaces ──────────────────────────────────────────────────────────

export interface ProContractor {
  id: string;
  name: string;
  avatar: string;
  specialty: 'kitchen' | 'bathroom' | 'both';
  rating: number;
  reviewCount: number;
  verified: boolean;
  location: string;
  priceRange: string;
  completedProjects: number;
}

export interface ScheduleMilestone {
  id: string;
  title: string;
  projectTitle: string;
  projectId: string;
  date: string;
  group: 'Today' | 'This Week' | 'Upcoming';
  status: 'pending' | 'in_progress' | 'completed';
  statusColor: string;
}

// ─── Extended Inspiration (for gallery) ──────────────────────────────────────

export const ALL_INSPIRATION_ITEMS: InspirationItem[] = [
  ...INSPIRATION_ITEMS,
  {
    id: 'i7',
    imageUrl: 'https://images.unsplash.com/photo-1755272853203-1469840c4c60?w=400&q=80',
    title: 'Farmhouse Kitchen Sink',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
    saves: 1892,
  },
  {
    id: 'i8',
    imageUrl: 'https://images.unsplash.com/photo-1564540579594-0930edb6de43?w=400&q=80',
    title: 'AI Double Vanity Design',
    category: 'ai_render',
    categoryLabel: 'AI Design',
    categoryColor: '#A78BFA',
    saves: 445,
  },
  {
    id: 'i9',
    imageUrl: 'https://images.unsplash.com/photo-1649083048597-d7b4f1e8a386?w=400&q=80',
    title: 'Quartz Kitchen Island',
    category: 'pro_work',
    categoryLabel: 'Pro Work',
    categoryColor: '#06C167',
    saves: 1340,
  },
  {
    id: 'i10',
    imageUrl: 'https://images.unsplash.com/photo-1760546120487-ccb54df9838c?w=400&q=80',
    title: 'Freestanding Bathtub',
    category: 'photos',
    categoryLabel: 'Photos',
    categoryColor: '#60A5FA',
    saves: 2310,
  },
];

// ─── Contractors ─────────────────────────────────────────────────────────────

export const FAKE_PROS: ProContractor[] = [
  {
    id: 'p1',
    name: 'BuildRight Co.',
    avatar: 'https://i.pravatar.cc/80?img=12',
    specialty: 'kitchen',
    rating: 4.9,
    reviewCount: 127,
    verified: true,
    location: 'Toronto, ON',
    priceRange: '$18k–$35k',
    completedProjects: 84,
  },
  {
    id: 'p2',
    name: 'PremiumFit Inc.',
    avatar: 'https://i.pravatar.cc/80?img=33',
    specialty: 'bathroom',
    rating: 4.8,
    reviewCount: 93,
    verified: true,
    location: 'Mississauga, ON',
    priceRange: '$8k–$22k',
    completedProjects: 61,
  },
  {
    id: 'p3',
    name: 'Nova Kitchens & Bath',
    avatar: 'https://i.pravatar.cc/80?img=57',
    specialty: 'both',
    rating: 4.7,
    reviewCount: 68,
    verified: true,
    location: 'Toronto, ON',
    priceRange: '$12k–$40k',
    completedProjects: 52,
  },
  {
    id: 'p4',
    name: 'AquaTile Bathrooms',
    avatar: 'https://i.pravatar.cc/80?img=22',
    specialty: 'bathroom',
    rating: 4.6,
    reviewCount: 41,
    verified: false,
    location: 'Brampton, ON',
    priceRange: '$6k–$18k',
    completedProjects: 29,
  },
  {
    id: 'p5',
    name: 'Urban Kitchen Studio',
    avatar: 'https://i.pravatar.cc/80?img=48',
    specialty: 'kitchen',
    rating: 4.9,
    reviewCount: 156,
    verified: true,
    location: 'Toronto, ON',
    priceRange: '$20k–$50k',
    completedProjects: 112,
  },
];

// ─── Schedule ────────────────────────────────────────────────────────────────

export const FAKE_SCHEDULE: ScheduleMilestone[] = [
  {
    id: 's1',
    title: 'Plumbing rough-in inspection',
    projectTitle: 'Kitchen Remodel',
    projectId: 'f1',
    date: 'Today, 2:00 PM',
    group: 'Today',
    status: 'in_progress',
    statusColor: '#F59E0B',
  },
  {
    id: 's2',
    title: 'Cabinet delivery & install',
    projectTitle: 'Kitchen Remodel',
    projectId: 'f1',
    date: 'Wed, Mar 25',
    group: 'This Week',
    status: 'pending',
    statusColor: '#6B6B6B',
  },
  {
    id: 's3',
    title: 'Countertop templating',
    projectTitle: 'Kitchen Remodel',
    projectId: 'f1',
    date: 'Fri, Mar 27',
    group: 'This Week',
    status: 'pending',
    statusColor: '#6B6B6B',
  },
  {
    id: 's4',
    title: 'Review quotes & select contractor',
    projectTitle: 'Master Bathroom',
    projectId: 'f2',
    date: 'Mon, Mar 30',
    group: 'Upcoming',
    status: 'pending',
    statusColor: '#6B6B6B',
  },
  {
    id: 's5',
    title: 'Appliance installation',
    projectTitle: 'Kitchen Remodel',
    projectId: 'f1',
    date: 'Apr 2',
    group: 'Upcoming',
    status: 'pending',
    statusColor: '#6B6B6B',
  },
];

// ─── News Detail Content ─────────────────────────────────────────────────────

export const NEWS_DETAIL_CONTENT: Record<string, string> = {
  n1: 'Our new AI Photo Analysis feature lets you upload photos of your kitchen or bathroom and receive instant insights. The AI identifies existing materials, layout characteristics, and structural elements — giving you a detailed breakdown before you even talk to a contractor.\n\nSimply snap 4+ photos of your space, and our AI will analyze cabinet condition, countertop materials, flooring type, fixture age, and more. This powers smarter contractor matching and more accurate estimates.\n\nTry it now by creating a new project and uploading your photos.',
  n2: 'Kitchen design is evolving fast in 2026. Here are the top trends our contractors are seeing:\n\n• Waterfall islands with book-matched stone are replacing standard edges\n• Integrated appliances with panel-ready fronts create seamless cabinetry\n• Matte finishes in black and forest green are overtaking glossy whites\n• Under-cabinet LED strips with warm dimming for ambient lighting\n• Pot-filler faucets over the range are making a strong comeback\n\nPlanning a kitchen reno? Start a project to get matched with specialists who know these trends.',
  n3: 'We\'ve updated how milestone payments work to make them even safer for homeowners.\n\nNow, when a contractor marks a milestone as complete, you\'ll receive a notification with photos of the work. You have 48 hours to review and approve before payment is released from escrow.\n\nIf anything looks off, you can flag the milestone for review. Our dispute resolution team will step in to help. Your money stays protected at every step of the renovation.',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
