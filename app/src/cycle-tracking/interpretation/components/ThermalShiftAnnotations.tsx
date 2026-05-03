// app/src/cycle-tracking/interpretation/components/ThermalShiftAnnotations.tsx
import type { CycleDayInput } from '../types';
import type { ChartAnnotationData } from '../getChartAnnotations';
import { fahrenheitToCelsius } from '../../utils';

export type ThermalShiftLayerProps = {
  data: ChartAnnotationData;
  days: CycleDayInput[];
  /** Display unit for converting day.bbt before the temp→y projection */
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT';
  /** Geometry of the chart plot area (px, relative to the chart container) */
  plotAreaOffset: number;
  plotAreaWidth: number;
  plotAreaTop: number;
  plotAreaHeight: number;
  /** Y-axis range in the same display unit as the chart */
  yAxisRange: { min: number; max: number };
  /** Day-axis range from chartData */
  minDay: number;
  maxDay: number;
};

const REFERENCE_HALO_COLOR = '#dbeafe';
const REFERENCE_HALO_RADIUS = 9;
const REFERENCE_HALO_OPACITY = 0.85;

const ANCHOR_HALO_COLOR = '#8b5cf6';
const ANCHOR_HALO_RADIUS = 11;
const ANCHOR_HALO_OPACITY = 0.22;

/**
 * Build the day→x and temp→y projection plus a `dotPosition` lookup for the
 * given props. Used by both the background and foreground layer components.
 */
function useChartProjection(props: ThermalShiftLayerProps) {
  const {
    days,
    temperatureUnit,
    plotAreaOffset,
    plotAreaWidth,
    plotAreaTop,
    plotAreaHeight,
    yAxisRange,
    minDay,
    maxDay,
  } = props;

  const numDays = maxDay - minDay + 1;
  const cellWidth = plotAreaWidth / numDays;

  const dayToX = (dayNumber: number): number => {
    const dayIndex = dayNumber - minDay;
    return plotAreaOffset + (dayIndex + 0.5) * cellWidth; // column centre
  };

  const tempToY = (tempInDisplayUnit: number): number =>
    plotAreaTop +
    ((yAxisRange.max - tempInDisplayUnit) / (yAxisRange.max - yAxisRange.min)) *
      plotAreaHeight;

  const dayMap = new Map(days.map((d) => [d.dayNumber, d]));

  const dotPosition = (dayNumber: number): { x: number; y: number } | null => {
    const day = dayMap.get(dayNumber);
    if (!day || day.bbt === null) return null;
    const tempInDisplay =
      temperatureUnit === 'CELSIUS' ? fahrenheitToCelsius(day.bbt) : day.bbt;
    return { x: dayToX(dayNumber), y: tempToY(tempInDisplay) };
  };

  return { cellWidth, dayToX, tempToY, dotPosition };
}

/**
 * Background layer: band + halos. Render this BEFORE <ReactApexChart /> in DOM
 * order so the chart's temperature line paints on top of it.
 */
export function ThermalShiftBackgroundLayer(props: ThermalShiftLayerProps) {
  const { data } = props;
  const { dotPosition } = useChartProjection(props);

  // Layer 1: reference-low halos — render every reference day EXCEPT the
  // anchor (the anchor gets the purple halo in Task 6).
  const referenceLowHalos = data.referenceDays
    .filter((dayNumber) => dayNumber !== data.anchorDay)
    .map((dayNumber) => {
      const pos = dotPosition(dayNumber);
      if (!pos) return null;
      return (
        <circle
          key={`ref-halo-${dayNumber}`}
          cx={pos.x}
          cy={pos.y}
          r={REFERENCE_HALO_RADIUS}
          fill={REFERENCE_HALO_COLOR}
          opacity={REFERENCE_HALO_OPACITY}
        />
      );
    });

  const anchorHalo = (() => {
    const pos = dotPosition(data.anchorDay);
    if (!pos) return null;
    return (
      <circle
        cx={pos.x}
        cy={pos.y}
        r={ANCHOR_HALO_RADIUS}
        fill={ANCHOR_HALO_COLOR}
        opacity={ANCHOR_HALO_OPACITY}
      />
    );
  })();

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        zIndex: 0, // mirrors fertile-window overlay; sits behind the chart
      }}
    >
      <g>{referenceLowHalos}</g>
      {/* Layer 2: coverline-anchor halo (purple) */}
      <g>{anchorHalo}</g>
      {/* Band (Layer 3) added in Task 7 */}
    </svg>
  );
}

/**
 * Foreground layer: numbered chevrons. Render this AFTER <ReactApexChart /> in
 * DOM order so the chevrons paint on top of the chart's temperature line.
 *
 * Implemented in Task 8.
 */
export function ThermalShiftForegroundLayer(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: ThermalShiftLayerProps,
) {
  // Placeholder — Task 8 implements the chevron rendering.
  return null;
}
