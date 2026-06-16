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
  MaterialOrderStatus,
  BidStatus,
  SupplierCategory,
  ApprovalRequestStatus,
  ApprovalRequestType,
} from '@/constants/enums';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  push_token: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  location: unknown; // PostGIS geography
  lat: number | null;
  lng: number | null;
  service_radius_km: number;
  license_number: string | null;
  license_doc_url: string | null;
  insurance_doc_url: string | null;
  wc_doc_url: string | null;
  stripe_account_id: string | null;
  stripe_details_submitted: boolean;
  stripe_payouts_enabled: boolean;
  stripe_transfers_active: boolean;
  stripe_onboarding_checked_at: string | null;
  verified: boolean;
  rating: number | null;
  total_reviews: number;
  created_at: string;
}

export interface Project {
  id: string;
  homeowner_id: string;
  description: string | null;
  address: string | null;
  location: unknown; // PostGIS geography
  room_type: RoomType | null;
  status: ProjectStatus;
  ai_analysis: AIAnalysis | null;
  questionnaire_answers: Record<string, unknown> | null;
  selected_render_id: string | null;
  ai_cost_min: number | null; // CAD cents
  ai_cost_max: number | null; // CAD cents
  ai_confidence_score: number | null;
  diy_category: string | null;
  diy_guide: Record<string, unknown> | null;
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
  sort_order: number | null;
  brand_preference: string | null;
  color_finish: string | null;
  specific_model: string | null;
  contractor_notes: string | null;
  order_status: MaterialOrderStatus | null;
  material_order_id: string | null;
  supplier_notes: string | null;
}

export interface Supplier {
  id: string;
  user_id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  location: unknown; // PostGIS geography
  lat: number | null;
  lng: number | null;
  service_radius_km: number;
  license_number: string | null;
  license_doc_url: string | null;
  categories: SupplierCategory[];
  stripe_account_id: string | null;
  stripe_details_submitted: boolean;
  stripe_payouts_enabled: boolean;
  stripe_transfers_active: boolean;
  stripe_onboarding_checked_at: string | null;
  verified: boolean;
  rating: number | null;
  total_reviews: number;
  fulfillment_rate: number | null;
  avg_delivery_days: number | null;
  created_at: string;
}

export interface GeneralContractor {
  id: string;
  user_id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  location: unknown; // PostGIS geography
  lat: number | null;
  lng: number | null;
  service_radius_km: number;
  license_number: string | null;
  license_doc_url: string | null;
  insurance_doc_url: string | null;
  stripe_account_id: string | null;
  stripe_details_submitted: boolean;
  stripe_payouts_enabled: boolean;
  stripe_transfers_active: boolean;
  stripe_onboarding_checked_at: string | null;
  verified: boolean;
  concierge_enabled: boolean;
  default_markup_pct: number;
  default_concierge_fee_pct: number;
  rating: number | null;
  total_reviews: number;
  created_at: string;
}

export interface GeneralContractorProject {
  id: string;
  project_id: string;
  general_contractor_id: string;
  homeowner_id: string;
  status: 'invited' | 'active' | 'completed' | 'removed';
  concierge_fee_pct: number;
  markup_pct: number;
  project_type: string | null;
  scope_summary: string | null;
  homeowner_contact_name: string | null;
  homeowner_contact_email: string | null;
  homeowner_contact_phone: string | null;
  initiated_by_gc: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectApprovalRequest {
  id: string;
  project_id: string;
  requested_by_gc_id: string;
  homeowner_id: string;
  request_type: ApprovalRequestType;
  title: string;
  description: string | null;
  cost_delta: number | null;
  timeline_delta_days: number | null;
  status: ApprovalRequestStatus;
  response_note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  responded_at: string | null;
}

export interface GcPaymentRequest {
  id: string;
  project_id: string;
  general_contractor_id: string;
  homeowner_id: string;
  request_kind: 'deposit' | 'progress_draw' | 'final_payment';
  title: string;
  description: string | null;
  amount_cents: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
  cancelled_at: string | null;
}

export type GcTradeQuoteNegotiationStatus = 'pending' | 'accepted' | 'rejected' | 'revision_requested' | 'cancelled';

export interface GcTradeQuoteNegotiation {
  id: string;
  project_id: string;
  slot_id: string | null;
  quote_id: string;
  general_contractor_id: string;
  company_id: string;
  homeowner_id: string;
  offer_amount_cents: number | null;
  scope_note: string;
  status: GcTradeQuoteNegotiationStatus;
  company_response_note: string | null;
  created_at: string;
  responded_at: string | null;
  cancelled_at: string | null;
}

export interface GcConciergeBooking {
  id: string;
  project_id: string;
  general_contractor_id: string;
  homeowner_id: string;
  service_kind: 'virtual_30' | 'virtual_60' | 'site_visit_first_hour' | 'full_project_concierge';
  title: string;
  duration_minutes: number | null;
  price_cents: number;
  contractor_payout_cents: number;
  walker_fee_cents: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';
  payment_status: 'unpaid' | 'payment_pending' | 'paid' | 'refunded';
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  paid_at: string | null;
  payout_released_at: string | null;
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface SupplierCatalogItem {
  id: string;
  supplier_id: string;
  name: string;
  description: string | null;
  category: SupplierCategory;
  sku: string | null;
  unit: string;
  price_per_unit: number; // CAD cents
  quality_tier: QualityTier;
  brand: string | null;
  lead_time_days: number;
  in_stock: boolean;
  stock_quantity: number | null;
  image_urls: string[];
  created_at: string;
}

export interface MaterialOrder {
  id: string;
  project_id: string;
  material_id: string;
  status: MaterialOrderStatus;
  accepted_supplier_id: string | null;
  catalog_item_id: string | null;
  category: SupplierCategory;
  quantity_needed: number;
  unit: string;
  quality_tier: QualityTier | null;
  offered_price: number | null; // CAD cents
  final_price: number | null; // CAD cents
  delivery_address: string | null;
  delivery_deadline: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  delivery_photo_url: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  platform_fee_pct: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  material?: Material;
  supplier?: Supplier;
}

export interface MaterialOrderBid {
  id: string;
  order_id: string;
  supplier_id: string;
  catalog_item_id: string | null;
  price_per_unit: number; // CAD cents
  total_price: number; // CAD cents
  lead_time_days: number | null;
  notes: string | null;
  status: BidStatus;
  submitted_at: string;
  // joined
  supplier?: Supplier;
  catalog_item?: SupplierCatalogItem;
}

export interface SupplierReview {
  id: string;
  order_id: string;
  supplier_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  on_time: boolean | null;
  quality_match: boolean | null;
  created_at: string;
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
  slot_id: string | null;
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
  approved_at: string | null;
  approved_by: string | null;
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
  company_id: string | null;
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
  push_sent: boolean;
  push_sent_at: string | null;
  push_error: string | null;
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
