export type UserRole = 'homeowner' | 'company' | 'admin';

export type ProjectStatus =
  | 'draft'
  | 'dispatching'
  | 'accepted'
  | 'quoting'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'disputed';

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

export type DisputeStatus = 'open' | 'under_review' | 'resolved';

export type DispatchResponse = 'pending' | 'accepted' | 'filled' | 'timeout' | 'declined';

export type QualityTier = 'budget' | 'mid-range' | 'luxury';

export type RoomType = 'kitchen' | 'bathroom';

export type NotificationType =
  | 'job_dispatched'
  | 'job_filled'
  | 'job_accepted'
  | 'quote_submitted'
  | 'quote_approved'
  | 'milestone_needs_approval'
  | 'milestone_paid'
  | 'new_message'
  | 'dispute_raised'
  | 'dispatch_no_match'
  | 'warranty_expiring';
