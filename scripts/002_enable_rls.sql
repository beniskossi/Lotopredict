-- Enable Row Level Security
ALTER TABLE public.draw_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to draw_schedules" ON public.draw_schedules;
DROP POLICY IF EXISTS "Allow public read access to draw_results" ON public.draw_results;
DROP POLICY IF EXISTS "Allow authenticated users to insert draw_results" ON public.draw_results;
DROP POLICY IF EXISTS "Allow authenticated users to update draw_results" ON public.draw_results;
DROP POLICY IF EXISTS "Allow authenticated users to delete draw_results" ON public.draw_results;
DROP POLICY IF EXISTS "Allow users to read their own admin profile" ON public.admin_profiles;
DROP POLICY IF EXISTS "Allow users to update their own admin profile" ON public.admin_profiles;

-- Policies for draw_schedules (public read-only)
CREATE POLICY "Allow public read access to draw_schedules"
  ON public.draw_schedules
  FOR SELECT
  TO public
  USING (true);

-- Policies for draw_results (public read, authenticated write)
CREATE POLICY "Allow public read access to draw_results"
  ON public.draw_results
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert draw_results"
  ON public.draw_results
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update draw_results"
  ON public.draw_results
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete draw_results"
  ON public.draw_results
  FOR DELETE
  TO authenticated
  USING (true);

-- Policies for admin_profiles (users can only access their own profile)
CREATE POLICY "Allow users to read their own admin profile"
  ON public.admin_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own admin profile"
  ON public.admin_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
