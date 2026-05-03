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

const BAND_LIGHT_COLOR = '#d1fae5';
const BAND_LIGHT_OPACITY = 0.55;
const BAND_DARK_COLOR = '#10b981';
const BAND_DARK_OPACITY = 0.18;

const CHEVRON_STROKE = '#10b981';
const CHEVRON_STROKE_WIDTH = 1.75;
const CHEVRON_NUMBER_COLOR = '#047857';
const CHEVRON_NUMBER_FONT_SIZE = 9;
const CHEVRON_NUMBER_FONT_WEIGHT = 700;
const CHEVRON_OFFSET_ABOVE_DOT = 18; // px: group origin offset above dot; apex (at local y=-2) lands 20 px above

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

  const columnRect = (
    dayNumber: number,
    fill: string,
    opacity: number,
    key: string,
  ) => {
    const dayIndex = dayNumber - minDay;
    const x = plotAreaOffset + dayIndex * cellWidth;
    return (
      <rect
        key={key}
        x={x}
        y={plotAreaTop}
        width={cellWidth}
        height={plotAreaHeight}
        fill={fill}
        opacity={opacity}
      />
    );
  };

  return { cellWidth, dayToX, tempToY, dotPosition, columnRect };
}

/**
 * Background layer: band + halos. Render this BEFORE <ReactApexChart /> in DOM
 * order so the chart's temperature line paints on top of it.
 */
export function ThermalShiftBackgroundLayer(props: ThermalShiftLayerProps) {
  const { data } = props;
  const { dotPosition, columnRect } = useChartProjection(props);

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
        key="anchor-halo"
        cx={pos.x}
        cy={pos.y}
        r={ANCHOR_HALO_RADIUS}
        fill={ANCHOR_HALO_COLOR}
        opacity={ANCHOR_HALO_OPACITY}
      />
    );
  })();

  const lighterBand = data.confirmingDays.map((dayNumber) =>
    columnRect(dayNumber, BAND_LIGHT_COLOR, BAND_LIGHT_OPACITY, `band-light-${dayNumber}`),
  );
  const darkerStripe = columnRect(
    data.confirmingDays[0],
    BAND_DARK_COLOR,
    BAND_DARK_OPACITY,
    `band-dark-${data.confirmingDays[0]}`,
  );

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
      {/* Layer 3: shift band (renders first so halos paint on top) */}
      <g>{lighterBand}</g>
      <g>{darkerStripe}</g>
      {/* Layer 1: reference-low halos (blue) */}
      <g>{referenceLowHalos}</g>
      {/* Layer 2: coverline-anchor halo (purple) */}
      <g>{anchorHalo}</g>
    </svg>
  );
}

/**
 * Foreground layer: numbered chevrons. Render this AFTER <ReactApexChart /> in
 * DOM order so the chevrons paint on top of the chart's temperature line.
 */
export function ThermalShiftForegroundLayer(props: ThermalShiftLayerProps) {
  const { data } = props;
  const { dotPosition } = useChartProjection(props);

  const chevrons = data.confirmingDays.map((dayNumber, i) => {
    const pos = dotPosition(dayNumber);
    if (!pos) return null;
    const tx = pos.x;
    const ty = pos.y - CHEVRON_OFFSET_ABOVE_DOT;
    return (
      <g key={`chevron-${dayNumber}`} transform={`translate(${tx},${ty})`}>
        <path
          d="M-5,4 L0,-2 L5,4"
          stroke={CHEVRON_STROKE}
          strokeWidth={CHEVRON_STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          y={14}
          textAnchor="middle"
          fontFamily="Satoshi, ui-sans-serif, system-ui"
          fontSize={CHEVRON_NUMBER_FONT_SIZE}
          fontWeight={CHEVRON_NUMBER_FONT_WEIGHT}
          fill={CHEVRON_NUMBER_COLOR}
        >
          {i + 1}
        </text>
      </g>
    );
  });

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        // No explicit zIndex — relying on DOM order. Rendered after
        // <ReactApexChart /> so it paints on top of the chart's SVG.
      }}
    >
      <g>{chevrons}</g>
    </svg>
  );
}
