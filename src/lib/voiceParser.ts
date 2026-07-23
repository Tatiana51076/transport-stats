export interface ParsedVoiceData {
  plate_number?: string;
  date?: string;
  trip_name?: string;
  driver_name?: string;
  contractor_name?: string;
  pallets?: number;
  cost?: number;
  action?: 'add_car' | 'add_driver' | 'add_contractor' | 'add_trip' | 'navigate';
  navigateTo?: string;
  textValue?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim();
}

function findBestMatch(query: string, list: { id: string; label: string }[]): string | null {
  const q = normalize(query);
  if (!q) return null;
  let best: { id: string; score: number } | null = null;
  for (const item of list) {
    const label = normalize(item.label);
    if (label === q) return item.id;
    if (label.includes(q) || q.includes(label)) {
      const score = Math.max(
        q.length / Math.max(label.length, 1),
        label.length / Math.max(q.length, 1)
      );
      if (!best || score > best.score) best = { id: item.id, score };
    }
  }
  const threshold = 0.4;
  return best && best.score >= threshold ? best.id : null;
}

function matchDate(text: string): string | null {
  const now = new Date();
  if (/сегодня|сегоня/i.test(text)) return toISO(now);
  if (/завтра/i.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 1); return toISO(d); }
  if (/вчера/i.test(text)) { const d = new Date(now); d.setDate(d.getDate() - 1); return toISO(d); }
  const m = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (m) {
    const d = new Date(Number(m[3] || now.getFullYear()), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime())) return toISO(d);
  }
  const months: Record<string, number> = {
    января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
    янв: 0, фев: 1, мар: 2, апр: 3, май: 4, июн: 5,
    июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
  };
  const monthMatch = text.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/i);
  if (monthMatch) {
    const day = Number(monthMatch[1]);
    const month = months[normalize(monthMatch[2])];
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(now.getFullYear(), month, day);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }
  return null;
}

function toISO(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function extractNumber(text: string): number | null {
  const wordMap: Record<string, number> = {
    ноль: 0, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4,
    пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
    одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
    пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18,
    девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
    шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
    сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500,
    шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
    тысяча: 1000, тысяч: 1000, тысячи: 1000,
  };
  const numMatch = text.match(/(\d+[.,]?\d*)/);
  if (numMatch) return parseFloat(numMatch[1].replace(',', '.'));
  const words = text.split(/\s+/);
  let total = 0;
  let current = 0;
  for (const w of words) {
    const n = wordMap[normalize(w)];
    if (n === undefined) { if (current > 0) { total += current; current = 0; } continue; }
    if (n >= 1000) { total += (current || 1) * n; current = 0; }
    else if (n >= 100) { current = (current || 1) * n; }
    else { current += n; }
  }
  total += current;
  return total > 0 ? total : null;
}

function stripPunctuation(text: string): string {
  return text.replace(/[.,!?;:()"'\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface VoiceLookups {
  cars: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
  contractors: { id: string; label: string }[];
  trips: { id: string; label: string }[];
}

export function parseVoiceInput(text: string, lookups: VoiceLookups): ParsedVoiceData {
  const clean = stripPunctuation(text);
  const lower = clean.toLowerCase();
  const result: ParsedVoiceData = {};

  if (/добавь\s+автомобиль|новая\s+машина/i.test(lower)) {
    result.action = 'add_car';
    result.textValue = clean;
    return result;
  }
  if (/добавь\s+водител|новый\s+водител/i.test(lower)) {
    result.action = 'add_driver';
    const nameMatch = clean.match(/водител[яь]\s+(.+)/i) || clean.match(/добавь\s+водител[яь]\s+(.+)/i);
    result.textValue = nameMatch ? nameMatch[1].trim() : clean;
    return result;
  }
  if (/добавь\s+контрагент|новый\s+контрагент/i.test(lower)) {
    result.action = 'add_contractor';
    const nameMatch = clean.match(/контрагент[а]?\s+(.+)/i) || clean.match(/добавь\s+контрагент[а]?\s+(.+)/i);
    result.textValue = nameMatch ? nameMatch[1].trim() : clean;
    return result;
  }
  if (/добавь\s+рейс|новый\s+рейс/i.test(lower)) {
    result.action = 'add_trip';
    const nameMatch = clean.match(/рейс[а]?\s+(.+)/i) || clean.match(/добавь\s+рейс\s+(.+)/i);
    result.textValue = nameMatch ? nameMatch[1].trim() : clean;
    return result;
  }

  const navMatch = clean.match(/(?:перейди|открой|покажи|навигаци)\s+(?:в\s+)?(.+)/i);
  if (navMatch) {
    const target = normalize(navMatch[1]);
    if (/автомобил/.test(target)) { result.action = 'navigate'; result.navigateTo = 'cars'; return result; }
    if (/рейс/.test(target)) { result.action = 'navigate'; result.navigateTo = 'trips'; return result; }
    if (/водител/.test(target)) { result.action = 'navigate'; result.navigateTo = 'drivers'; return result; }
    if (/контрагент/.test(target)) { result.action = 'navigate'; result.navigateTo = 'contractors'; return result; }
    if (/отчет|отчёт/.test(target)) { result.action = 'navigate'; result.navigateTo = 'reports'; return result; }
    if (/дашборд/.test(target)) { result.action = 'navigate'; result.navigateTo = 'reports'; return result; }
  }

  const date = matchDate(clean);
  if (date) result.date = date;

  const palletMatch = clean.match(/(\d+)\s*паллет|\bпаллет\s*(\d+)/i);
  if (palletMatch) {
    result.pallets = parseInt(palletMatch[1] || palletMatch[2], 10);
  } else {
    const palletWord = extractNumber(clean);
    if (palletWord && (/\bпаллет/.test(lower))) result.pallets = Math.round(palletWord);
  }

  const costMatch = clean.match(/(\d+[.,]?\d*)\s*(?:рубл|₽|р\b)/i);
  if (costMatch) {
    result.cost = parseFloat(costMatch[1].replace(',', '.'));
  } else {
    const allNumbers = clean.match(/\d+/g);
    if (allNumbers && allNumbers.length > 0) {
      const palletValue = result.pallets;
      const numbers = allNumbers.map(Number).filter((n) => n > 0 && n !== palletValue);
      if (numbers.length > 0) {
        result.cost = numbers[numbers.length - 1];
      }
    }
  }

  for (const car of lookups.cars) {
    if (result.plate_number) break;
    if (clean.toUpperCase().includes(car.label.toUpperCase())) {
      result.plate_number = car.id;
    }
  }

  if (!result.plate_number) {
    const plateMatch = clean.match(/([а-яa-z]\d{3}[а-яa-z]{2}\d{2,3})/i);
    if (plateMatch) {
      const found = findBestMatch(plateMatch[1], lookups.cars);
      if (found) result.plate_number = found;
    }
  }

  if (!result.driver_name) {
    result.driver_name = findBestMatch(
      clean.replace(/водител[ьяюе]+\s*/gi, '').trim(),
      lookups.drivers
    );
  }

  if (!result.contractor_name) {
    result.contractor_name = findBestMatch(clean, lookups.contractors);
  }

  if (!result.trip_name) {
    result.trip_name = findBestMatch(clean, lookups.trips);
  }

  return result;
}
