
-- Coding tests table
CREATE TABLE public.coding_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Coding questions with test cases
CREATE TABLE public.coding_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coding_test_id UUID NOT NULL REFERENCES public.coding_tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  test_cases JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Coding test attempts
CREATE TABLE public.coding_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coding_test_id UUID NOT NULL REFERENCES public.coding_tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  score INTEGER DEFAULT NULL,
  total_questions INTEGER DEFAULT NULL
);

-- Code submissions per question
CREATE TABLE public.coding_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.coding_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.coding_questions(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  result JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coding_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coding_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coding_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coding_submissions ENABLE ROW LEVEL SECURITY;

-- Coding tests policies
CREATE POLICY "Teachers can CRUD own coding tests" ON public.coding_tests FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Students can view published coding tests" ON public.coding_tests FOR SELECT USING (is_published = true);

-- Coding questions policies
CREATE POLICY "Teachers can manage coding questions" ON public.coding_questions FOR ALL USING (EXISTS (SELECT 1 FROM public.coding_tests WHERE coding_tests.id = coding_questions.coding_test_id AND coding_tests.teacher_id = auth.uid()));
CREATE POLICY "Students can view questions of published coding tests" ON public.coding_questions FOR SELECT USING (EXISTS (SELECT 1 FROM public.coding_tests WHERE coding_tests.id = coding_questions.coding_test_id AND coding_tests.is_published = true));

-- Coding attempts policies
CREATE POLICY "Students can manage own coding attempts" ON public.coding_attempts FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Teachers can view coding attempts for their tests" ON public.coding_attempts FOR SELECT USING (EXISTS (SELECT 1 FROM public.coding_tests WHERE coding_tests.id = coding_attempts.coding_test_id AND coding_tests.teacher_id = auth.uid()));

-- Coding submissions policies
CREATE POLICY "Students can manage own submissions" ON public.coding_submissions FOR ALL USING (EXISTS (SELECT 1 FROM public.coding_attempts WHERE coding_attempts.id = coding_submissions.attempt_id AND coding_attempts.student_id = auth.uid()));
CREATE POLICY "Teachers can view submissions for their tests" ON public.coding_submissions FOR SELECT USING (EXISTS (SELECT 1 FROM public.coding_attempts ca JOIN public.coding_tests ct ON ct.id = ca.coding_test_id WHERE ca.id = coding_submissions.attempt_id AND ct.teacher_id = auth.uid()));

-- Updated_at trigger for coding_tests
CREATE TRIGGER update_coding_tests_updated_at BEFORE UPDATE ON public.coding_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
