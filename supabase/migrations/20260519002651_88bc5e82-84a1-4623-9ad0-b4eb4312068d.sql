
CREATE TABLE public.audit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_file_name text NOT NULL,
  target_file_format text NOT NULL,
  target_storage_path text NOT NULL,
  target_full_markdown text,
  status text NOT NULL DEFAULT 'pending',
  status_message text,
  progress_percent integer NOT NULL DEFAULT 0,
  total_sentences integer NOT NULL DEFAULT 0,
  total_findings integer NOT NULL DEFAULT 0,
  error_message text,
  report_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  finding_type text NOT NULL,
  excerpt text NOT NULL,
  excerpt_position integer NOT NULL DEFAULT 0,
  matched_rule_id uuid REFERENCES public.audit_rules(id) ON DELETE SET NULL,
  matched_clause_id uuid REFERENCES public.regulation_clauses(id) ON DELETE SET NULL,
  severity text NOT NULL,
  reason text,
  improvement text,
  reviewed boolean NOT NULL DEFAULT false,
  is_false_positive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_findings_session ON public.audit_findings(session_id);

ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_audit_sessions_all" ON public.audit_sessions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "demo_audit_findings_all" ON public.audit_findings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.audit_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_sessions;

INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-targets', 'audit-targets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "demo_audit_targets_all" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id = 'audit-targets')
  WITH CHECK (bucket_id = 'audit-targets');
