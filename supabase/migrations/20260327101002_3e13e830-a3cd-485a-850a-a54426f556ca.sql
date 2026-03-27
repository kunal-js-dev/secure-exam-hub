
CREATE TABLE public.coding_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coding_attempt_id uuid NOT NULL REFERENCES public.coding_attempts(id) ON DELETE CASCADE,
  violation_type text NOT NULL,
  description text,
  seen_by_teacher boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.coding_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert coding violations for own attempts"
  ON public.coding_violations FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.coding_attempts
    WHERE coding_attempts.id = coding_violations.coding_attempt_id
      AND coding_attempts.student_id = auth.uid()
  ));

CREATE POLICY "Students can view own coding violations"
  ON public.coding_violations FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.coding_attempts
    WHERE coding_attempts.id = coding_violations.coding_attempt_id
      AND coding_attempts.student_id = auth.uid()
  ));

CREATE POLICY "Teachers can view coding violations for their tests"
  ON public.coding_violations FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.coding_attempts ca
    JOIN public.coding_tests ct ON ct.id = ca.coding_test_id
    WHERE ca.id = coding_violations.coding_attempt_id
      AND ct.teacher_id = auth.uid()
  ));

CREATE POLICY "Teachers can update coding violations for their tests"
  ON public.coding_violations FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM public.coding_attempts ca
    JOIN public.coding_tests ct ON ct.id = ca.coding_test_id
    WHERE ca.id = coding_violations.coding_attempt_id
      AND ct.teacher_id = auth.uid()
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE public.coding_violations;
