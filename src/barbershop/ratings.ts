import type { Appointment, RatingInfo } from './types.js';
import { loadAppointments, updateAppointment } from './store.js';

export function saveRating(
  apptId: string,
  stars: number,
  comment?: string,
  barberStars?: number
): Appointment | null {
  const rating: RatingInfo = {
    stars: Math.min(5, Math.max(1, Math.round(stars))),
    comment,
    barberStars: barberStars != null ? Math.min(5, Math.max(1, barberStars)) : undefined,
    at: new Date().toISOString(),
  };
  return updateAppointment(apptId, {
    rating,
    status: 'rated',
  });
}

export function ratingsSummary(): {
  avg: number;
  count: number;
  byBarber: Array<{ name: string; avg: number; count: number }>;
  recent: Array<{ name: string; stars: number; comment?: string; barber: string }>;
} {
  const all = loadAppointments().filter((a) => a.rating);
  const count = all.length;
  const avg =
    count === 0
      ? 0
      : all.reduce((s, a) => s + (a.rating?.stars || 0), 0) / count;

  const map = new Map<string, { sum: number; n: number; name: string }>();
  for (const a of all) {
    const cur = map.get(a.barberId) || { sum: 0, n: 0, name: a.barberName };
    cur.sum += a.rating!.stars;
    cur.n += 1;
    map.set(a.barberId, cur);
  }
  const byBarber = Array.from(map.values())
    .map((v) => ({ name: v.name, avg: v.sum / v.n, count: v.n }))
    .sort((a, b) => b.avg - a.avg);

  const recent = all
    .slice()
    .sort((a, b) => (b.rating!.at || '').localeCompare(a.rating!.at || ''))
    .slice(0, 10)
    .map((a) => ({
      name: a.clientName,
      stars: a.rating!.stars,
      comment: a.rating!.comment,
      barber: a.barberName,
    }));

  return { avg, count, byBarber, recent };
}

export function starsBar(n: number): string {
  const s = Math.round(n);
  return '★'.repeat(s) + '☆'.repeat(5 - s);
}
