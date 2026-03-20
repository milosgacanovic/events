CREATE TABLE editor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  intent TEXT NOT NULL,
  intent_other TEXT,
  description TEXT,
  practice_category_ids UUID[] DEFAULT '{}',
  proof_url TEXT,
  claim_host_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'more_info')),
  admin_notes TEXT,
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_editor_applications_status ON editor_applications(status);
CREATE INDEX idx_editor_applications_user ON editor_applications(user_id);
