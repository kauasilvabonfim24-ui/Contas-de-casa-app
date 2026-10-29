ALTER TABLE public.contas ADD COLUMN valor_total numeric, ADD COLUMN pessoas integer NOT NULL DEFAULT 1;

CREATE TABLE public.compartilhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  de_user uuid NOT NULL DEFAULT auth.uid(),
  de_email text NOT NULL,
  para_email text NOT NULL,
  mes text NOT NULL,
  dados jsonb NOT NULL,
  lido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compartilhamentos TO authenticated;
GRANT ALL ON public.compartilhamentos TO service_role;
ALTER TABLE public.compartilhamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "send own" ON public.compartilhamentos FOR INSERT TO authenticated WITH CHECK (auth.uid() = de_user AND de_email = lower(auth.jwt()->>'email'));
CREATE POLICY "read mine" ON public.compartilhamentos FOR SELECT TO authenticated USING (auth.uid() = de_user OR para_email = lower(auth.jwt()->>'email'));
CREATE POLICY "mark read" ON public.compartilhamentos FOR UPDATE TO authenticated USING (para_email = lower(auth.jwt()->>'email')) WITH CHECK (para_email = lower(auth.jwt()->>'email'));
CREATE POLICY "delete mine" ON public.compartilhamentos FOR DELETE TO authenticated USING (auth.uid() = de_user OR para_email = lower(auth.jwt()->>'email'));