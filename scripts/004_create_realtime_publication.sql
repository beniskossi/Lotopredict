-- Enable Realtime for draw_results table
-- This allows the application to receive real-time updates when data changes

-- Drop existing publication if it exists
DROP PUBLICATION IF EXISTS supabase_realtime;

-- Create publication for realtime updates
CREATE PUBLICATION supabase_realtime FOR TABLE public.draw_results;

-- Add draw_schedules to realtime if needed
ALTER PUBLICATION supabase_realtime ADD TABLE public.draw_schedules;

-- Grant necessary permissions for realtime
GRANT SELECT ON public.draw_results TO anon, authenticated;
GRANT SELECT ON public.draw_schedules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.draw_results TO authenticated;
