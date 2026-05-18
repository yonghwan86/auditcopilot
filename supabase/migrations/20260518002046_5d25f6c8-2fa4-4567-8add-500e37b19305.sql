CREATE TABLE public.audit_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('keyword','forbidden','required')),
  trigger_value text NOT NULL,
  condition_desc text,
  severity text NOT NULL CHECK (severity IN ('상','중','하')),
  related_clause_ref text,
  improvement_template text,
  is_active boolean NOT NULL DEFAULT true,
  false_positive_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_audit_rules_select" ON public.audit_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "demo_audit_rules_insert" ON public.audit_rules FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "demo_audit_rules_update" ON public.audit_rules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_audit_rules_delete" ON public.audit_rules FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX idx_audit_rules_active ON public.audit_rules(is_active);