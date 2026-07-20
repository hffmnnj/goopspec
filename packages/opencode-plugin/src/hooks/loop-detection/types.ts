/**
 * Shared types for the loop-detection engine.
 */

export interface Entry {
  tool: string;
  normalizedArgsHash: string;
  outputHash: string;
  timestamp: number;
}

export interface LoopDetectionConfig {
  enabled: boolean;
  tier1Threshold: number;
  windowSize: number;
  tier2Threshold: number;
}
