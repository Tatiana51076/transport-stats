import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Car, Driver, Contractor, Trip } from '@/lib/types';

export interface References {
  cars: Car[];
  drivers: Driver[];
  contractors: Contractor[];
  trips: Trip[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useReferences(): References {
  const [cars, setCars] = useState<Car[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [c, d, ct, tr] = await Promise.all([
      supabase.from('cars').select('*').order('created_at', { ascending: false }),
      supabase.from('drivers').select('*').order('full_name'),
      supabase.from('contractors').select('*').order('name'),
      supabase.from('trips').select('*').order('name'),
    ]);
    if (c.error || d.error || ct.error || tr.error) {
      setError(c.error?.message || d.error?.message || ct.error?.message || tr.error?.message || 'Ошибка загрузки справочников');
    } else {
      setCars(c.data as Car[]);
      setDrivers(d.data as Driver[]);
      setContractors(ct.data as Contractor[]);
      setTrips(tr.data as Trip[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { cars, drivers, contractors, trips, loading, error, reload: load };
}
