// ============================================================
// Engine input
// ============================================================

/** A single cycle day as consumed by the interpretation engine. */
export type CycleDayInput = {
  dayNumber: number;
  bbt: number | null;             // Celsius (as stored in DB)
  bbtTime: string | null;         // "HH:MM" or null
  excludeFromInterpretation: boolean;
  disturbanceFactors: string[];
  travelTimeDiff: number | null;  // minutes offset if travel event
};

// ============================================================
// Thermal shift result — discriminated union
// ============================================================

export type ThermalShiftResult =
  | ThermalShiftNone
  | ThermalShiftPending
  | ThermalShiftConfirmed;

export type ThermalShiftNone = {
  status: 'none';
  reason: 'insufficient_data' | 'no_shift_detected';
  failedAttempts: FailedAttempt[];
};

export type ThermalShiftPending = {
  status: 'pending';
  shiftDay: number;
  coverlineTemp: number;            // °C, full precision
  referenceDays: number[];
  confirmingDays: number[];         // 1-3 recorded so far
  skippedDays: number[];
  usedFourthDayException: boolean;  // false while pending
  confidence: Confidence;
  confidenceReasons: string[];
  failedAttempts: FailedAttempt[];
};

export type ThermalShiftConfirmed = {
  status: 'confirmed';
  shiftDay: number;
  coverlineTemp: number;            // °C, full precision
  referenceDays: number[];
  confirmingDays: number[];         // 3 or 4 days
  skippedDays: number[];
  usedFourthDayException: boolean;
  confidence: Confidence;
  confidenceReasons: string[];
  failedAttempts: FailedAttempt[];
};

export type Confidence = 'high' | 'low';

export type FailedAttempt = {
  attemptedShiftDay: number;
  coverlineTemp: number;
  referenceDays: number[];
  failureReason: string;
  failedOnDay: number;
};

// ============================================================
// Post-shift monitoring
// ============================================================

export type PostShiftMonitoring = {
  isActive: boolean;
  falseRiseWarning: 'active' | 'dismissed' | null;
  daysMonitored: number;
  dipsBelow: DipBelow[];
  consecutiveUnexplainedDips: number;
};

export type DipBelow = {
  day: number;
  temp: number;       // °C
  explained: boolean;
  factors: string[];
};

// ============================================================
// Nudges
// ============================================================

export type NudgeType = 'pre_shift_outlier' | 'post_shift_dip';

export type Nudge = {
  day: number;
  type: NudgeType;
  message: string;
  resolved: boolean;
  response?: 'yes_disturbed' | 'no_correct';
};

// ============================================================
// Measurement time window
// ============================================================

export type TimeWindow = {
  meanMinutes: number;        // minutes since midnight (0-1439)
  windowStart: number;        // mean - 60 min (wrapped)
  windowEnd: number;          // mean + 60 min (wrapped)
};

export type TimeWindowResult = {
  hasWindow: boolean;
  segments: TimeWindowSegment[];
};

export type TimeWindowSegment = {
  fromDay: number;
  toDay: number;
  window: TimeWindow;
};

// ============================================================
// User overrides (stored in DB)
// ============================================================

export type UserOverrides = {
  shiftDay?: number;
  // Note: coverlineTemp was removed in v2 (2026-04-26). The coverline is
  // now always derived from raw days via collectReferenceDays(days, shiftDay).
  // Stored values from before this change are silently ignored.
};

// ============================================================
// Full interpretation result (returned by orchestrator)
// ============================================================

export type InterpretationResult = {
  thermalShift: ThermalShiftResult;
  nudges: Nudge[];
  timeWindow: TimeWindowResult;
};
