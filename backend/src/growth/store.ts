import fs from 'fs';
import path from 'path';
import type { GrowthFunnel, GrowthOpportunity, OpportunityStatus } from './types.js';
import { tenantPaths } from '../platform/tenant-runtime.js';

function filePath(): string {
  const p = tenantPaths();
  return path.join(p.dataDir, 'growth-opportunities.json');
}

function ensure(): GrowthOpportunity[] {
  const f = filePath();
  const dir = path.dirname(f);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, '[]', 'utf8');
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save(list: GrowthOpportunity[]): void {
  fs.writeFileSync(filePath(), JSON.stringify(list.slice(0, 2000), null, 2), 'utf8');
}

function newId(): string {
  return (
    'GO' +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 5).toUpperCase()
  );
}

export function listOpportunities(filter?: {
  status?: OpportunityStatus | OpportunityStatus[];
  since?: string;
}): GrowthOpportunity[] {
  let list = ensure();
  if (filter?.status) {
    const set = Array.isArray(filter.status) ? filter.status : [filter.status];
    list = list.filter((o) => set.includes(o.status));
  }
  if (filter?.since) {
    list = list.filter((o) => o.createdAt >= filter.since!);
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOpportunity(id: string): GrowthOpportunity | null {
  return ensure().find((o) => o.id === id) || null;
}

export function createOpportunity(
  partial: Omit<GrowthOpportunity, 'id' | 'createdAt' | 'updatedAt'>
): GrowthOpportunity {
  const now = new Date().toISOString();
  const o: GrowthOpportunity = {
    ...partial,
    id: newId(),
    createdAt: now,
    updatedAt: now,
  };
  const list = ensure();
  list.unshift(o);
  save(list);
  return o;
}

export function updateOpportunity(
  id: string,
  patch: Partial<GrowthOpportunity>
): GrowthOpportunity | null {
  const list = ensure();
  const i = list.findIndex((o) => o.id === id);
  if (i < 0) return null;
  list[i] = {
    ...list[i],
    ...patch,
    classification: patch.classification
      ? { ...list[i].classification, ...patch.classification }
      : list[i].classification,
    updatedAt: new Date().toISOString(),
  };
  save(list);
  return list[i];
}

export function growthFunnel(sinceIso?: string): GrowthFunnel {
  const since =
    sinceIso ||
    (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    })();
  const list = listOpportunities({ since });
  return {
    found: list.length,
    delivered: list.filter((o) =>
      ['delivered', 'contacted', 'won', 'lost', 'new'].includes(o.status)
    ).length,
    contacted: list.filter((o) =>
      ['contacted', 'won', 'lost'].includes(o.status)
    ).length,
    won: list.filter((o) => o.status === 'won').length,
    revenue: list
      .filter((o) => o.status === 'won')
      .reduce((s, o) => s + (o.attributedRevenue || 0), 0),
    hot: list.filter((o) => o.classification.temperature === 'hot').length,
    warm: list.filter((o) => o.classification.temperature === 'warm').length,
    cold: list.filter((o) => o.classification.temperature === 'cold').length,
  };
}

export function openGrowthCount(): number {
  return listOpportunities({
    status: ['new', 'delivered'],
  }).length;
}
