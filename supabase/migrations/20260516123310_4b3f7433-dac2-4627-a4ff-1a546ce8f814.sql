
-- regulations table
CREATE TABLE public.regulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_format text NOT NULL CHECK (file_format IN ('pdf','hwp','hwpx','txt','docx')),
  category text NOT NULL CHECK (category IN ('법률','시행령','시행규칙','내부규정','지침')),
  effective_date date,
  storage_path text NOT NULL,
  full_markdown text,
  is_image_based boolean NOT NULL DEFAULT false,
  parse_status text NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending','parsing','completed','failed')),
  parse_error text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_regulations_category ON public.regulations(category);
CREATE INDEX idx_regulations_created_at ON public.regulations(created_at DESC);

-- regulation_clauses table
CREATE TABLE public.regulation_clauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_id uuid NOT NULL REFERENCES public.regulations(id) ON DELETE CASCADE,
  clause_id text NOT NULL,
  title text,
  content text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_regulation_clauses_regulation_id ON public.regulation_clauses(regulation_id);
CREATE INDEX idx_regulation_clauses_order ON public.regulation_clauses(regulation_id, order_index);

-- Enable RLS
ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_clauses ENABLE ROW LEVEL SECURITY;

-- Demo (no-auth) policies: allow all to anon + authenticated
CREATE POLICY "demo_regulations_select" ON public.regulations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "demo_regulations_insert" ON public.regulations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "demo_regulations_update" ON public.regulations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_regulations_delete" ON public.regulations FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "demo_clauses_select" ON public.regulation_clauses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "demo_clauses_insert" ON public.regulation_clauses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "demo_clauses_update" ON public.regulation_clauses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo_clauses_delete" ON public.regulation_clauses FOR DELETE TO anon, authenticated USING (true);

-- Storage bucket: regulations (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'regulations',
  'regulations',
  true,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'application/x-hwp',
    'application/hwp',
    'application/hwp+zip',
    'application/vnd.hancom.hwpx',
    'application/vnd.hancom.hwp',
    'application/octet-stream',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
);

-- Storage policies: public read/write/delete for demo
CREATE POLICY "demo_regulations_storage_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'regulations');

CREATE POLICY "demo_regulations_storage_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'regulations');

CREATE POLICY "demo_regulations_storage_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'regulations')
  WITH CHECK (bucket_id = 'regulations');

CREATE POLICY "demo_regulations_storage_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'regulations');
