import type { Confidence } from '../types';

export type ConfidenceResult = {
  confidence: Confidence;
  reasons: string[];
};

export function calculateConfidence(excludedCount: number): ConfidenceResult {
  if (excludedCount <= 2) {
    return { confidence: 'high', reasons: [] };
  }

  return {
    confidence: 'low',
    reasons: [
      `${excludedCount} temperatures were excluded from the reference window. ` +
      `The engine had to reach further back, which may reduce relevance to the current cycle.`,
    ],
  };
}
