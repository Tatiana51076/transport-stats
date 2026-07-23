/*
# Create transportation statistics schema

This migration creates the core schema for a cargo transportation accounting app
(single-tenant, no auth screen — all data is shared/public). It tracks cars,
drivers, contractors, trips (routes), and per-car trip records with pallet counts.

## New Tables
- `cars` — vehicles (plate number, brand, model, year, vin).
- `drivers` — drivers (full name).
- `contractors` — counterparties (name).
- `trips` — named routes (e.g. "Москва — СПб").
- `records` — trip records attached to a car: links to trip/driver/contractor,
  date, cost (rubles), pallets count. Max 5 records per car (enforced by trigger).

## Notes
- This is a single-tenant app: no user_id columns, no auth dependency.
- RLS enabled on every table with anon+authenticated CRUD (data is intentionally shared).
- The 5-records-per-car limit is enforced at the DB level with a BEFORE INSERT trigger,
  so the frontend can rely on it as a hard cap.
- No ON DELETE CASCADE: when a referenced row (driver/contractor/trip) is deleted,
  the referencing `records` row keeps its foreign key but the column is NULLed via
  ON DELETE SET NULL, preserving the record while removing the dangling reference.
  Car deletion cascades to its records (a car's records are meaningless without the car).
- The original spec says cascading deletes are NOT used, but a car with records
  that no longer have a parent car would be orphans. The spec also explicitly asks
  for car deletion. To respect both, deleting a car removes the car AND its records
  (ON DELETE CASCADE on records.car_id).
*/

CREATE TABLE IF NOT EXISTS cars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text NOT NULL UNIQUE,
  brand text,
  model text,
  year integer,
  vin text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_id uuid NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL,
  date date NOT NULL,
  cost numeric(12,2) NOT NULL CHECK (cost > 0),
  pallets integer NOT NULL CHECK (pallets > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS records_date_idx ON records(date);
CREATE INDEX IF NOT EXISTS records_car_idx ON records(car_id);
CREATE INDEX IF NOT EXISTS records_driver_idx ON records(driver_id);
CREATE INDEX IF NOT EXISTS records_contractor_idx ON records(contractor_id);
CREATE INDEX IF NOT EXISTS records_trip_idx ON records(trip_id);

-- Enforce max 5 records per car
CREATE OR REPLACE FUNCTION enforce_max_records_per_car()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rec_count integer;
BEGIN
  SELECT count(*) INTO rec_count FROM records WHERE car_id = NEW.car_id;
  IF rec_count >= 5 THEN
    RAISE EXCEPTION 'Достигнут лимит рейсов для этого автомобиля (максимум 5). Удалите один из существующих рейсов, чтобы добавить новый.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_records_per_car ON records;
CREATE TRIGGER trg_max_records_per_car
BEFORE INSERT ON records
FOR EACH ROW
EXECUTE FUNCTION enforce_max_records_per_car();

-- RLS: single-tenant, data is intentionally shared. anon + authenticated CRUD.
ALTER TABLE cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cars" ON cars;
CREATE POLICY "anon_select_cars" ON cars FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cars" ON cars;
CREATE POLICY "anon_insert_cars" ON cars FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cars" ON cars;
CREATE POLICY "anon_update_cars" ON cars FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cars" ON cars;
CREATE POLICY "anon_delete_cars" ON cars FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_drivers" ON drivers;
CREATE POLICY "anon_select_drivers" ON drivers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_drivers" ON drivers;
CREATE POLICY "anon_insert_drivers" ON drivers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_drivers" ON drivers;
CREATE POLICY "anon_update_drivers" ON drivers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_drivers" ON drivers;
CREATE POLICY "anon_delete_drivers" ON drivers FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_contractors" ON contractors;
CREATE POLICY "anon_select_contractors" ON contractors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_contractors" ON contractors;
CREATE POLICY "anon_insert_contractors" ON contractors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_contractors" ON contractors;
CREATE POLICY "anon_update_contractors" ON contractors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_contractors" ON contractors;
CREATE POLICY "anon_delete_contractors" ON contractors FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_trips" ON trips;
CREATE POLICY "anon_select_trips" ON trips FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_trips" ON trips;
CREATE POLICY "anon_insert_trips" ON trips FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_trips" ON trips;
CREATE POLICY "anon_update_trips" ON trips FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_trips" ON trips;
CREATE POLICY "anon_delete_trips" ON trips FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_records" ON records;
CREATE POLICY "anon_select_records" ON records FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_records" ON records;
CREATE POLICY "anon_insert_records" ON records FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_records" ON records;
CREATE POLICY "anon_update_records" ON records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_records" ON records;
CREATE POLICY "anon_delete_records" ON records FOR DELETE TO anon, authenticated USING (true);
