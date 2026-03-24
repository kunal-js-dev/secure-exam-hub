
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('student', 'teacher');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  role app_role NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table for RLS helper
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Tests table
CREATE TABLE public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_minutes INT NOT NULL DEFAULT 30,
  is_published BOOLEAN NOT NULL DEFAULT false,
  allow_result_review BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.tests(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  marks INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

-- Test attempts
CREATE TABLE public.test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.tests(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  score INT,
  total_marks INT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','terminated')),
  UNIQUE(test_id, student_id)
);

-- Student answers
CREATE TABLE public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES public.test_attempts(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  selected_option TEXT CHECK (selected_option IN ('A','B','C','D')),
  UNIQUE(attempt_id, question_id)
);

-- Violations
CREATE TABLE public.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES public.test_attempts(id) ON DELETE CASCADE NOT NULL,
  violation_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_by_teacher BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user role from profiles
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Trigger to create profile and user_role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'student');
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), _role);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON public.tests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Teachers can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'teacher'));

-- USER_ROLES policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- TESTS policies
CREATE POLICY "Teachers can CRUD own tests" ON public.tests FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Students can view published tests" ON public.tests FOR SELECT USING (is_published = true);

-- QUESTIONS policies
CREATE POLICY "Teachers can manage questions" ON public.questions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = questions.test_id AND tests.teacher_id = auth.uid()));
CREATE POLICY "Students can view questions of published tests" ON public.questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = questions.test_id AND tests.is_published = true));

-- TEST_ATTEMPTS policies
CREATE POLICY "Students can manage own attempts" ON public.test_attempts FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Teachers can view attempts for their tests" ON public.test_attempts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tests WHERE tests.id = test_attempts.test_id AND tests.teacher_id = auth.uid()));

-- STUDENT_ANSWERS policies
CREATE POLICY "Students can manage own answers" ON public.student_answers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.test_attempts WHERE test_attempts.id = student_answers.attempt_id AND test_attempts.student_id = auth.uid()));
CREATE POLICY "Teachers can view answers for their tests" ON public.student_answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.test_attempts ta JOIN public.tests t ON t.id = ta.test_id WHERE ta.id = student_answers.attempt_id AND t.teacher_id = auth.uid()));

-- VIOLATIONS policies
CREATE POLICY "Students can insert violations for own attempts" ON public.violations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.test_attempts WHERE test_attempts.id = violations.attempt_id AND test_attempts.student_id = auth.uid()));
CREATE POLICY "Students can view own violations" ON public.violations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.test_attempts WHERE test_attempts.id = violations.attempt_id AND test_attempts.student_id = auth.uid()));
CREATE POLICY "Teachers can view violations for their tests" ON public.violations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.test_attempts ta JOIN public.tests t ON t.id = ta.test_id WHERE ta.id = violations.attempt_id AND t.teacher_id = auth.uid()));
CREATE POLICY "Teachers can update violations for their tests" ON public.violations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.test_attempts ta JOIN public.tests t ON t.id = ta.test_id WHERE ta.id = violations.attempt_id AND t.teacher_id = auth.uid()));

-- Enable realtime for violations
ALTER PUBLICATION supabase_realtime ADD TABLE public.violations;
