export interface Car {
  id: string;
  plate_number: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  created_at: string;
}

export interface Driver {
  id: string;
  full_name: string;
  created_at: string;
}

export interface Contractor {
  id: string;
  name: string;
  created_at: string;
}

export interface Trip {
  id: string;
  name: string;
  created_at: string;
}

export interface RecordRow {
  id: string;
  car_id: string;
  trip_id: string | null;
  driver_id: string | null;
  contractor_id: string | null;
  date: string;
  cost: number;
  pallets: number;
  created_at: string;
}

export interface RecordWithRefs extends RecordRow {
  trips?: { id: string; name: string } | null;
  drivers?: { id: string; full_name: string } | null;
  contractors?: { id: string; name: string } | null;
  cars?: { id: string; plate_number: string; brand: string | null; model: string | null } | null;
}

export const MAX_RECORDS_PER_CAR = 5;
