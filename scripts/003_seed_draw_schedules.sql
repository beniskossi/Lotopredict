-- Seed draw_schedules with all 28 lottery draws
INSERT INTO public.draw_schedules (day_of_week, draw_name, time) VALUES
  -- Lundi
  ('Lundi', 'Réveil', '10:00'),
  ('Lundi', 'Étoile', '13:00'),
  ('Lundi', 'Akwaba', '16:00'),
  ('Lundi', 'Monday Special', '18:15'),
  -- Mardi
  ('Mardi', 'La Matinale', '10:00'),
  ('Mardi', 'Émergence', '13:00'),
  ('Mardi', 'Sika', '16:00'),
  ('Mardi', 'Lucky Tuesday', '18:15'),
  -- Mercredi
  ('Mercredi', 'Première Heure', '10:00'),
  ('Mercredi', 'Fortune', '13:00'),
  ('Mercredi', 'Baraka', '16:00'),
  ('Mercredi', 'Midweek', '18:15'),
  -- Jeudi
  ('Jeudi', 'Kado', '10:00'),
  ('Jeudi', 'Privilège', '13:00'),
  ('Jeudi', 'Monni', '16:00'),
  ('Jeudi', 'Fortune Thursday', '18:15'),
  -- Vendredi
  ('Vendredi', 'Cash', '10:00'),
  ('Vendredi', 'Solution', '13:00'),
  ('Vendredi', 'Wari', '16:00'),
  ('Vendredi', 'Friday Bonanza', '18:15'),
  -- Samedi
  ('Samedi', 'Soutra', '10:00'),
  ('Samedi', 'Diamant', '13:00'),
  ('Samedi', 'Moaye', '16:00'),
  ('Samedi', 'National', '18:15'),
  -- Dimanche
  ('Dimanche', 'Bénédiction', '10:00'),
  ('Dimanche', 'Prestige', '13:00'),
  ('Dimanche', 'Awalé', '16:00'),
  ('Dimanche', 'Espoir', '18:15')
ON CONFLICT (day_of_week, time) DO NOTHING;
