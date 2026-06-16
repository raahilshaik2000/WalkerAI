export type UserRole = 'homeowner' | 'company' | 'supplier' | 'general_contractor' | 'admin';
export type PublicSignupRole = Exclude<UserRole, 'admin'>;

export type ProjectStatus =
  | 'draft'
  | 'brief_ready'
  | 'dispatching'
  | 'scheduling'
  | 'accepted'
  | 'quoting'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'diy_saved';

export type MilestoneStatus =
  | 'pending'
  | 'started'
  | 'in_progress'
  | 'completed'
  | 'homeowner_approved'
  | 'paid';

export type PermitStatus =
  | 'not_applied'
  | 'applied'
  | 'approved'
  | 'inspection_scheduled'
  | 'passed';

export type QuoteStatus = 'pending' | 'approved' | 'rejected';

export type ChangeOrderStatus = 'proposed' | 'approved' | 'rejected';

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type ApprovalRequestType =
  | 'scope_change'
  | 'material_substitution'
  | 'trade_substitution'
  | 'schedule_change'
  | 'payment_release'
  | 'change_order'
  | 'general_recommendation';

export type DisputeStatus = 'open' | 'under_review' | 'resolved';

export type DispatchResponse = 'pending' | 'accepted' | 'filled' | 'timeout' | 'declined';

export type QualityTier = 'budget' | 'mid-range' | 'luxury';

export type RoomType = 'kitchen' | 'bathroom';

export const GC_PROJECT_TYPES = [
  'kitchen',
  'bathroom',
  'flooring',
  'painting',
  'basement',
  'addition',
  'other',
] as const;

export type GeneralContractorProjectType = typeof GC_PROJECT_TYPES[number];

export type MaterialOrderStatus =
  | 'open'
  | 'accepted'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'confirmed'
  | 'paid'
  | 'cancelled';

export type BidStatus = 'pending' | 'selected' | 'rejected';

export const SUPPLIER_CATEGORIES = [
  'Cabinets & Storage',
  'Countertops & Surfaces',
  'Tile & Flooring',
  'Plumbing Fixtures',
  'Lighting & Electrical',
  'Appliances',
  'Hardware & Fixtures',
  'Paint & Wall Coverings',
  'Lumber & Structural',
  'Windows & Doors',
  'Insulation & Drywall',
  'Other',
] as const;

export type SupplierCategory = typeof SUPPLIER_CATEGORIES[number];

export type NotificationType =
  | 'job_dispatched'
  | 'job_filled'
  | 'job_accepted'
  | 'slot_dispatched'
  | 'slot_accepted'
  | 'all_slots_filled'
  | 'schedule_confirmed'
  | 'quote_submitted'
  | 'quote_approved'
  | 'milestone_needs_approval'
  | 'milestone_completed'
  | 'milestone_paid'
  | 'project_complete'
  | 'new_message'
  | 'dispute_raised'
  | 'dispatch_no_match'
  | 'warranty_expiring'
  | 'new_material_order'
  | 'material_order_claimed'
  | 'bid_selected'
  | 'bid_rejected'
  | 'order_shipped'
  | 'order_delivered'
  | 'supplier_paid'
  | 'gc_approval_requested'
  | 'gc_approval_responded'
  | 'gc_management_invited'
  | 'gc_management_invite_received'
  | 'gc_management_confirmed'
  | 'gc_payment_requested'
  | 'gc_payment_responded'
  | 'gc_concierge_booking_requested'
  | 'gc_concierge_booking_responded'
  | 'gc_concierge_booking_paid'
  | 'gc_concierge_payout_released'
  | 'gc_trade_negotiation_requested'
  | 'gc_trade_negotiation_responded';
