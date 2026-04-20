/*
  # Poultry Farm Management Schema
  
  1. New Tables
    - `gallineros` - Chicken coops
      - `id` (uuid, primary key)
      - `name` (text) - Coop name
      - `color` (text) - Display color
      - `capacity` (integer) - Max chickens
      - `current_count` (integer) - Current chickens
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `production_records` - Daily egg production
      - `id` (uuid, primary key)
      - `gallinero_id` (uuid, foreign key)
      - `date` (date)
      - `eggs_count` (integer)
      - `laying_percentage` (decimal) - Auto calculated
      - `notes` (text)
      - `created_at` (timestamp)
    
    - `sales` - Egg sales
      - `id` (uuid, primary key)
      - `date` (date)
      - `type` (enum: 'maple', 'docena', 'media_docena')
      - `quantity` (integer)
      - `price_per_unit` (decimal)
      - `total_price` (decimal)
      - `notes` (text)
      - `created_at` (timestamp)
    
    - `events` - Farm events (deaths, vaccines, observations)
      - `id` (uuid, primary key)
      - `gallinero_id` (uuid, foreign key)
      - `event_type` (enum: 'muerte', 'vacuna', 'observacion')
      - `description` (text)
      - `affected_count` (integer) - For deaths
      - `date` (timestamp)
      - `created_at` (timestamp)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for public access (no auth required for this app)
*/

CREATE TABLE IF NOT EXISTS gallineros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  capacity integer NOT NULL DEFAULT 100,
  current_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallinero_id uuid NOT NULL REFERENCES gallineros(id) ON DELETE CASCADE,
  date date NOT NULL,
  eggs_count integer NOT NULL,
  laying_percentage numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('maple', 'docena', 'media_docena')),
  quantity integer NOT NULL,
  price_per_unit numeric NOT NULL,
  total_price numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallinero_id uuid NOT NULL REFERENCES gallineros(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('muerte', 'vacuna', 'observacion')),
  description text NOT NULL,
  affected_count integer DEFAULT 0,
  date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gallineros ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on gallineros"
  ON gallineros FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert on gallineros"
  ON gallineros FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update on gallineros"
  ON gallineros FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete on gallineros"
  ON gallineros FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read on production_records"
  ON production_records FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert on production_records"
  ON production_records FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update on production_records"
  ON production_records FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete on production_records"
  ON production_records FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read on sales"
  ON sales FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert on sales"
  ON sales FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update on sales"
  ON sales FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete on sales"
  ON sales FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read on events"
  ON events FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert on events"
  ON events FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update on events"
  ON events FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete on events"
  ON events FOR DELETE
  TO public
  USING (true);

CREATE INDEX idx_production_gallinero_date ON production_records(gallinero_id, date);
CREATE INDEX idx_sales_date ON sales(date);
CREATE INDEX idx_events_gallinero_date ON events(gallinero_id, date);
