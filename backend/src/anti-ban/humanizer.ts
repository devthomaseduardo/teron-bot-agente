import type { AntiBanConfig } from '../config/types.js';

export function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Delay inicial “humano” antes de responder */
export function computeReplyDelay(cfg: AntiBanConfig): number {
  return randomBetween(cfg.minReplyDelayMs, cfg.maxReplyDelayMs);
}

/** Tempo de digitação proporcional ao texto, com teto */
export function computeTypingMs(text: string, cfg: AntiBanConfig): number {
  const raw = Math.floor(text.length * cfg.typingMsPerChar);
  return Math.min(cfg.typingMaxMs, Math.max(400, raw + randomBetween(-150, 250)));
}

export function computeBubbleGap(cfg: AntiBanConfig): number {
  return randomBetween(cfg.minGapBetweenBubblesMs, cfg.maxGapBetweenBubblesMs);
}
