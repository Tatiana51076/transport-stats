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

export interface Expense {
  id: string;
  category: 'leasing' | 'fuel' | 'salary' | 'taxes' | 'other';
  car_id: string | null;
  amount: number;
  date: string;
  description: string | null;
  employee_name: string | null;
  created_at: string;
}

export interface ExpenseWithCar extends Expense {
  cars?: { id: string; plate_number: string; brand: string | null; model: string | null } | null;
}

export const EXPENSE_CATEGORIES: { key: Expense['category']; label: string; icon: string }[] = [
  { key: 'leasing', label: 'Лизинг', icon: 'FileText' },
  { key: 'fuel', label: 'Топливо', icon: 'Fuel' },
  { key: 'salary', label: 'Зарплата', icon: 'Users' },
  { key: 'taxes', label: 'Налоги', icon: 'Receipt' },
  { key: 'other', label: 'Прочие', icon: 'MoreHorizontal' },
];

export const MAX_RECORDS_PER_CAR = 5;
