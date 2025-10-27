-- Create draw_schedules table
CREATE TABLE IF NOT EXISTS public.draw_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week TEXT NOT NULL,
  draw_name TEXT NOT NULL,
  time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(day_of_week, time)
);

-- Create draw_results table
CREATE TABLE IF NOT EXISTS public.draw_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_name TEXT NOT NULL,
  draw_date DATE NOT NULL,
  winning_numbers INTEGER[] NOT NULL,
  machine_numbers INTEGER[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(draw_date, draw_name)
);

-- Create admin_profiles table (for admin authentication)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_draw_results_draw_name ON public.draw_results(draw_name);
CREATE INDEX IF NOT EXISTS idx_draw_results_draw_date ON public.draw_results(draw_date DESC);
CREATE INDEX IF NOT EXISTS idx_draw_results_draw_name_date ON public.draw_results(draw_name, draw_date DESC);
CREATE INDEX IF NOT EXISTS idx_draw_schedules_day ON public.draw_schedules(day_of_week);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_draw_schedules_updated_at ON public.draw_schedules;
CREATE TRIGGER update_draw_schedules_updated_at
  BEFORE UPDATE ON public.draw_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_draw_results_updated_at ON public.draw_results;
CREATE TRIGGER update_draw_results_updated_at
  BEFORE UPDATE ON public.draw_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_profiles_updated_at ON public.admin_profiles;
CREATE TRIGGER update_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.draw_schedules IS 'Stores the schedule for all 28 lottery draws (4 per day)';
COMMENT ON TABLE public.draw_results IS 'Stores historical lottery results with winning and machine numbers';
COMMENT ON TABLE public.admin_profiles IS 'Stores admin user profiles for authentication';
