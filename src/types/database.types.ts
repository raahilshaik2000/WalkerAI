import type {
  UserRole,
  ProjectStatus,
  MilestoneStatus,
  PermitStatus,
  QuoteStatus,
  ChangeOrderStatus,
  DisputeStatus,
  DispatchResponse,
  QualityTier,
  RoomType,
  NotificationType,
} from '@/constants/enums';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  push_token: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  location: unknown; // PostGIS geography
  service_radius_km: number;
  license_number: string | null;
  insurance_doc_url: string | null;
  wc_doc_url: string | null;
  stripe_account_id: string | null;
  verified: boolean;
  rating: number | null;
  total_reviews: number;
  created_at: string;
}

export interface Project {
  id: string;
  homeowner_id: string;
  address: string;
  location: unknown; // PostGIS geography
  room_type: RoomType;
  status: ProjectStatus;
  ai_analysis: AIAnalysis | null;
  questionnaire_answers: Record<string, unknown> | null;
  selected_render_id: string | null;
  ai_cost_min: number | null; // CAD cents
  ai_cost_max: number | null; // CAD cents
  created_at: string;
}

export interface ProjectPhoto {
  id: string;
  project_id: string;
  url: string;
  storage_path: string;
  uploaded_at: string;
}

export interface Render {
  id: string;
  project_id: string;
  url: string;
  style_params: Record<string, unknown> | null;
  selected: boolean;
  created_at: string;
}

export interface Material {
  id: string;
  project_id: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  quality_tier: QualityTier;
}

export interface ScopeOfWork {
  id: string;
  project_id: string;
  phase: string;
  description: string;
  sort_order: number;
}

export interface Permit {
  id: string;
  project_id: string;
  permit_type: string;
  status: PermitStatus;
  document_url: string | null;
  updated_at: string;
}

export interface Quote {
  id: string;
  project_id: string;
  company_id: string;
  total_amount: number; // CAD cents
  stripe_payment_intent_id: string | null;
  stripe_transfer_group: string | null;
  submitted_at: string;
  approved_at: string | null;
  status: QuoteStatus;
}

export interface Milestone {
  id: string;
  quote_id: string;
  title: string;
  amount: number; // CAD cents
  status: MilestoneStatus;
  due_date: string | null;
  completed_at: string | null;
  stripe_transfer_id: string | null;
  sort_order: number;
}

export interface Message {
  id: string;
  project_id: string;
  sender_id: string;
  body: string | null;
  attachment_url: string | null;
  sent_at: string;
}

export interface Review {
  id: string;
  project_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  quality_rating: number | null;
  communication_rating: number | null;
  timeliness_rating: number | null;
  cleanliness_rating: number | null;
  comment: string | null;
  created_at: string;
}

export interface Warranty {
  id: string;
  project_id: string;
  document_url: string;
  expiry_date: string | null;
  created_at: string;
}

export interface ChangeOrder {
  id: string;
  project_id: string;
  description: string;
  cost_delta: number | null; // CAD cents, can be negative
  status: ChangeOrderStatus;
  signed_by_homeowner: boolean;
  signed_by_company: boolean;
  created_at: string;
}

export interface Dispute {
  id: string;
  project_id: string;
  raised_by: string;
  milestone_id: string | null;
  reason: string;
  status: DisputeStatus;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface DispatchLog {
  id: string;
  project_id: string;
  company_id: string;
  round: number;
  dispatched_at: string;
  response: DispatchResponse;
}

// Claude AI analysis result structure
export interface AIAnalysis {
  room_type: RoomType;
  existing_materials: {
    cabinets?: { type: string; condition: 'poor' | 'fair' | 'good'; estimated_age_years: number };
    countertops?: { material: string; condition: string };
    flooring?: { material: string; condition: string };
    fixtures: string[];
    appliances?: string[];
  };
  layout: {
    estimated_sqft: number;
    has_island?: boolean;
    plumbing_wall_visible: boolean;
    window_count: number;
  };
  structural_concerns: string[];
  ai_observations: string;
}

// Questionnaire from Claude
export interface QuestionnaireQuestion {
  id: string;
  text: string;
  type: 'single_select' | 'multi_select' | 'scale';
  context_note: string;
  options: Array<{
    id: string;
    label: string;
    next_question_id: string | null;
  }>;
  min?: number;
  max?: number;
}

export interface Questionnaire {
  questions: QuestionnaireQuestion[];
}
