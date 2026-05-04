import type { CycleDayInput, TimeWindow, TimeWindowResult, TimeWindowSegment } from '../types';

const MINUTES_PER_DAY = 1440;
const WINDOW_HALF_WIDTH = 60;
const MIN_DATA_POINTS = 5;

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function circularMean(minuteValues: number[]): number {
  let sinSum = 0;
  let cosSum = 0;

  for (const m of minuteValues) {
    const angle = (m / MINUTES_PER_DAY) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  const meanAngle = Math.atan2(sinSum, cosSum);
  let meanMinutes = (meanAngle / (2 * Math.PI)) * MINUTES_PER_DAY;

  if (meanMinutes < 0) meanMinutes += MINUTES_PER_DAY;

  return Math.round(meanMinutes);
}

function buildWindow(meanMinutes: number): TimeWindow {
  let windowStart = meanMinutes - WINDOW_HALF_WIDTH;
  let windowEnd = meanMinutes + WINDOW_HALF_WIDTH;

  if (windowStart < 0) windowStart += MINUTES_PER_DAY;
  if (windowEnd >= MINUTES_PER_DAY) windowEnd -= MINUTES_PER_DAY;

  return { meanMinutes, windowStart, windowEnd };
}

export function calculateTimeWindow(days: CycleDayInput[]): TimeWindowResult {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  const segments: { from: number; to: number; days: CycleDayInput[] }[] = [];
  let currentSegmentStart = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].travelTimeDiff != null && sorted[i].travelTimeDiff !== 0 && i > 0) {
      segments.push({
        from: sorted[currentSegmentStart].dayNumber,
        to: sorted[i - 1].dayNumber,
        days: sorted.slice(currentSegmentStart, i),
      });
      currentSegmentStart = i;
    }
  }
  segments.push({
    from: sorted[currentSegmentStart].dayNumber,
    to: sorted[sorted.length - 1].dayNumber,
    days: sorted.slice(currentSegmentStart),
  });

  const resultSegments: TimeWindowSegment[] = [];

  for (const seg of segments) {
    const timesMinutes: number[] = [];
    for (const d of seg.days) {
      if (d.bbtTime) {
        timesMinutes.push(parseTimeToMinutes(d.bbtTime));
      }
    }

    if (timesMinutes.length < MIN_DATA_POINTS) continue;

    const meanMinutes = circularMean(timesMinutes);
    resultSegments.push({
      fromDay: seg.from,
      toDay: seg.to,
      window: buildWindow(meanMinutes),
    });
  }

  return {
    hasWindow: resultSegments.length > 0,
    segments: resultSegments,
  };
}

export function isWithinWindow(time: string, window: TimeWindow): boolean {
  const minutes = parseTimeToMinutes(time);

  if (window.windowStart <= window.windowEnd) {
    return minutes >= window.windowStart && minutes <= window.windowEnd;
  }

  return minutes >= window.windowStart || minutes <= window.windowEnd;
}
