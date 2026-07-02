-- ============================================================
-- VAWT Specification Sheet — Supabase Schema Setup
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Project: eyfthdxhsaxhwjfhdrio
-- ============================================================

CREATE TABLE IF NOT EXISTS vawt_submissions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  doc_id                text,
  status                text DEFAULT 'draft',

  -- Section 1.1: Contact & project identity
  client_name           text,
  project_name          text,
  contact_name          text,
  contact_email         text,
  contact_phone         text,

  -- Section 1.2: Installation site
  site_address          text,
  site_type             text,
  altitude              numeric,
  mean_wind_speed       numeric,
  wind_direction        text,
  site_constraints      text,

  -- Section 1.3: Power requirements
  target_power          numeric,
  annual_energy_target  numeric,
  grid_connection       text,
  output_voltage        text,
  grid_frequency        text,

  -- Section 1.4: Physical constraints
  max_rotor_height      numeric,
  max_rotor_diameter    numeric,
  max_install_height    numeric,
  rotor_type            text,

  -- Section 1.5: Environmental & regulatory
  max_noise             numeric,
  certification_standard text,
  survival_wind_speed   numeric,
  temp_min              numeric,
  temp_max              numeric,
  client_notes          text,

  -- Weibull wind resource
  weibull_k             numeric,
  weibull_c             numeric,
  ref_height            numeric,
  hub_height            numeric,
  roughness_length      numeric,
  weibull_data          jsonb,   -- full 0–30 m/s table rows

  -- Section 2.1: Blade geometry
  num_blades            integer,
  aerofoil              text,
  chord_length          numeric,
  rotor_radius          numeric,
  blade_height          numeric,
  solidity_ratio        numeric,
  pitch_angle           text,
  rated_tsr             numeric,

  -- Section 2.2: Operating envelope
  cut_in_speed          numeric,
  rated_wind_speed      numeric,
  cut_out_speed         numeric,
  peak_cp               text,

  -- Section 2.3: Performance targets
  target_cp             numeric,
  aep_calculated        text,
  capacity_factor       numeric,
  design_life           numeric,
  natural_freq          text,
  noise_predicted       text,

  -- Section 2.4: Structural & material
  blade_material        text,
  shaft_material        text,
  target_blade_mass     numeric,
  total_rotor_mass      text,
  safety_factor         numeric,
  surface_treatment     text,

  -- Section 2.5: Drivetrain & generator
  generator_type        text,
  rated_rpm             numeric,
  gearbox_ratio         text,
  generator_efficiency  numeric,
  braking_system        text,

  -- Section 2.6: Simulation methods
  aero_methods          jsonb,   -- string array
  structural_methods    jsonb,   -- string array
  cfd_solver            text,
  fem_software          text,
  turbulence_model      text,

  -- Section 2.7: Validation & testing
  scale_test            text,
  scale_ratio           text,
  instrumentation       text,
  acceptance_criteria   text,

  -- Section 2.8: Design review
  gate_status           text DEFAULT 'preliminary',
  lead_engineer         text,
  review_date           text,
  engineering_notes     text
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vawt_submissions_updated_at
  BEFORE UPDATE ON vawt_submissions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Row Level Security
ALTER TABLE vawt_submissions ENABLE ROW LEVEL SECURITY;

-- Open policy (adjust for auth later)
CREATE POLICY "Allow all operations" ON vawt_submissions
  FOR ALL USING (true) WITH CHECK (true);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_vawt_doc_id ON vawt_submissions(doc_id);
CREATE INDEX IF NOT EXISTS idx_vawt_status ON vawt_submissions(status);
CREATE INDEX IF NOT EXISTS idx_vawt_created ON vawt_submissions(created_at DESC);

-- ============================================================
-- After running above, add your anon key to the app:
-- In vawt-spec-app.html, search for YOUR_ANON_KEY_HERE
-- and replace with your key from:
-- https://supabase.com/dashboard/project/eyfthdxhsaxhwjfhdrio/settings/api
-- ============================================================
