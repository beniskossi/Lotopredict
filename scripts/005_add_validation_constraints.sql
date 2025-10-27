-- Add validation constraints to ensure data integrity

-- Ensure winning_numbers array has exactly 5 elements
ALTER TABLE public.draw_results
  ADD CONSTRAINT check_winning_numbers_length
  CHECK (array_length(winning_numbers, 1) = 5);

-- Ensure machine_numbers array has exactly 5 elements when not null
ALTER TABLE public.draw_results
  ADD CONSTRAINT check_machine_numbers_length
  CHECK (machine_numbers IS NULL OR array_length(machine_numbers, 1) = 5);

-- Ensure all numbers are between 1 and 90
ALTER TABLE public.draw_results
  ADD CONSTRAINT check_winning_numbers_range
  CHECK (
    winning_numbers <@ ARRAY(SELECT generate_series(1, 90))
  );

ALTER TABLE public.draw_results
  ADD CONSTRAINT check_machine_numbers_range
  CHECK (
    machine_numbers IS NULL OR
    machine_numbers <@ ARRAY(SELECT generate_series(1, 90))
  );

-- Ensure draw_date is not in the future
ALTER TABLE public.draw_results
  ADD CONSTRAINT check_draw_date_not_future
  CHECK (draw_date <= CURRENT_DATE);

-- Ensure time format is valid (HH:MM)
ALTER TABLE public.draw_schedules
  ADD CONSTRAINT check_time_format
  CHECK (time ~ '^\d{2}:\d{2}$');
