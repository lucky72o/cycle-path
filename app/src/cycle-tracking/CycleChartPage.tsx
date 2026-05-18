import { useMemo, useRef, useEffect, useState, Fragment } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleById, getUserSettings, getUserCycles } from 'wasp/client/operations';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import ReactApexChart from 'react-apexcharts';
import { toDisplayTemperature, formatTemperature, formatDate, formatDateLong, formatDateDDMMMYYYY, resolveCycleDayIsoDate, getDayOfWeekAbbreviationChip, getDayOfWeek, getCycleDayCount, getTempNodeLabel, computeContainerMinWidth, buildMonthSpans, isCycleDayInTail, getCFBarColor, getCFBarHeight } from './utils';
import type { ApexOptions } from 'apexcharts';
import SideNav from './SideNav';
import { useInterpretation } from './interpretation/hooks/useInterpretation';
import type { CycleDayInput } from './interpretation/types';
import { PropositionCard } from './interpretation/components/PropositionCard';
import { AnovulatoryCard } from './interpretation/components/AnovulatoryCard';
import { UninterpretableCard } from './interpretation/components/UninterpretableCard';
import { CycleBadge } from './interpretation/components/CycleBadge';
import { CrossCycleAnovulatoryBanner } from './interpretation/components/CrossCycleAnovulatoryBanner';
import { NudgeIcon } from './interpretation/components/NudgeIcon';
import { NudgeMessage } from './interpretation/components/NudgeMessage';
import { NoteEditorSheet } from './components/NoteEditorSheet';
import { getPreviousCycleSummary } from 'wasp/client/operations';
import { getActiveCoverline } from './interpretation/getActiveCoverline';
import { getChartAnnotations } from './interpretation/getChartAnnotations';
import {
  ThermalShiftBackgroundLayer,
  ThermalShiftForegroundLayer,
} from './interpretation/components/ThermalShiftAnnotations';
import toast from 'react-hot-toast';

const DISTURBANCE_EMOJI: Record<string, string> = {
  POOR_SLEEP: '🌙',
  TRAVEL: '✈️',
  STRESS: '😵',
  ILLNESS_FEVER: '🤒',
  DIFFERENT_WAKE_TIME: '⏰',
  ALCOHOL: '🍷',
  MEDICATION: '💊',
  HOT_COLD_ROOM: '🌡️',
};

/**
 * Per-month-index color tokens for the cycle chart header.
 *
 * monthIndex 0 = first calendar month present in the displayed cycle range,
 * 1 = second, 2+ = fallback (rare; only triggers for cycles spanning three
 * calendar months). Drives the pill, the date underline, the weekday chip,
 * the cycle-day chip, and the hover wash for every cell in the column.
 *
 * Why these specific hues — see the "Color tokens" section in
 * docs/superpowers/specs/2026-05-12-graph-header-design.md.
 */
const MONTH_PALETTE: Record<number, {
  pillBg: string;
  pillText: string;
  chipBg: string;
  chipText: string;
  underline: string;
  hoverWash: string;
}> = {
  0: { pillBg: '#dbeafe', pillText: '#1e3a8a', chipBg: '#dbeafe', chipText: '#1e3a8a', underline: '#60a5fa', hoverWash: '#dbeafe' }, // blue (1st month)
  1: { pillBg: '#dcfce7', pillText: '#14532d', chipBg: '#dcfce7', chipText: '#14532d', underline: '#4ade80', hoverWash: '#dcfce7' }, // green (2nd month)
  2: { pillBg: '#f1f5f9', pillText: '#334155', chipBg: '#f1f5f9', chipText: '#334155', underline: '#94a3b8', hoverWash: '#f1f5f9' }, // slate (3rd+ month)
};

function paletteFor(monthIndex: number) {
  return MONTH_PALETTE[Math.min(monthIndex, 2)];
}

export default function CycleChartPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  
  const { data: allCycles } = useQuery(getUserCycles);
  const { data: cycle, isLoading: cycleLoading } = useQuery(getCycleById, { cycleId: cycleId || '' }, { enabled: !!cycleId });
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);
  const { data: previousCycle } = useQuery(
    getPreviousCycleSummary,
    { cycleNumber: cycle?.cycleNumber ?? 0 },
    { enabled: !!cycle?.isActive && typeof cycle?.cycleNumber === 'number' }
  );

  // Notes row expand/collapse state — synced from server settings.
  const [notesRowExpanded, setNotesRowExpanded] = useState<boolean>(false);
  // Sync local state with the server-confirmed value whenever it loads/changes
  // (e.g. settings refetched, another tab updated them). The local state is the
  // source of truth for rendering; the query value is just the seed. We
  // intentionally syncing-into-state here so optimistic flips work — see
  // toggleNotesRow below. We also intentionally depend only on the boolean field,
  // not the whole settings object, so noise refetches that produce equal values
  // don't trigger spurious re-renders.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {
    if (settings) {
      setNotesRowExpanded(settings.notesRowExpanded);
    }
  }, [settings?.notesRowExpanded]);

  const toggleNotesRow = async () => {
    const previous = notesRowExpanded;
    const next = !previous;

    // Optimistic flip — UI updates immediately.
    setNotesRowExpanded(next);

    try {
      const { updateUserSettings } = await import('wasp/client/operations');
      await updateUserSettings({ notesRowExpanded: next });
      // Wasp's entities-based cache invalidation will refetch getUserSettings;
      // the useEffect above re-syncs local state with the confirmed value.
    } catch (e: any) {
      // Revert local state and let the user know.
      setNotesRowExpanded(previous);
      console.error('Failed to toggle notes row:', e);
      toast.error('Could not save row preference. Try again.');
    }
  };

  // Refs and state for custom x-axis rows
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredDayNumber, setHoveredDayNumber] = useState<number | null>(null);
  const [plotAreaOffset, setPlotAreaOffset] = useState<number>(0);
  const [plotAreaWidth, setPlotAreaWidth] = useState<number>(0);
  const [plotAreaTop, setPlotAreaTop] = useState<number>(0);
  const [plotAreaHeight, setPlotAreaHeight] = useState<number>(0);
  const [chartHeight, setChartHeight] = useState<number>(0);
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  // Last known cursor position relative to the chart container — used for tooltip placement.
  // Refs (not state) so mousemove doesn't trigger re-renders.
  const cursorXRef = useRef<number | null>(null);
  const cursorYRef = useRef<number | null>(null);

  // Pinned tooltip state — set on tap/click so the tooltip becomes interactive
  const [pinnedDayNumber, setPinnedDayNumber] = useState<number | null>(null);
  const [pinnedCrosshairX, setPinnedCrosshairX] = useState<number | null>(null);
  const pinnedDayNumberRef = useRef<number | null>(null);
  const pinnedCrosshairXRef = useRef<number | null>(null);

  const [expandedNudgeDay, setExpandedNudgeDay] = useState<number | null>(null);
  const [editorOpenForDay, setEditorOpenForDay] = useState<number | null>(null);

  // Touch gesture tracking
  const isTouchScrollingRef = useRef<boolean>(false);
  const lastTouchedDayRef = useRef<number | null>(null);
  const lastTouchEndTimeRef = useRef<number>(0);

  // If no cycleId provided, redirect to active cycle
  useMemo(() => {
    if (!cycleId && allCycles && allCycles.length > 0) {
      const activeCycle = allCycles.find(c => c.isActive);
      if (activeCycle) {
        navigate(`/cycles/${activeCycle.id}/chart`, { replace: true });
      }
    }
  }, [cycleId, allCycles]);

  // Separate included and excluded BBT days
  const allDaysWithBBT = useMemo(() => {
    if (!cycle) return [];
    return cycle.days.filter((day: any) => day.bbt !== null);
  }, [cycle]);

  const includedBBTDays = useMemo(() => {
    return allDaysWithBBT.filter((day: any) => !day.excludeFromInterpretation);
  }, [allDaysWithBBT]);

  const excludedBBTDays = useMemo(() => {
    return allDaysWithBBT.filter((day: any) => day.excludeFromInterpretation);
  }, [allDaysWithBBT]);

  // Convert cycle days to engine input format
  const cycleDayInputs: CycleDayInput[] = useMemo(() => {
    if (!cycle) return [];
    return cycle.days.map((d: any) => ({
      dayNumber: d.dayNumber,
      bbt: d.bbt,
      bbtTime: d.bbtTime,
      excludeFromInterpretation: d.excludeFromInterpretation,
      disturbanceFactors: d.disturbanceFactors ?? [],
      travelTimeDiff: d.travelTimeDiff,
    }));
  }, [cycle]);

  const maxDayNumber = useMemo(() => {
    if (cycleDayInputs.length === 0) return 0;
    return Math.max(...cycleDayInputs.map((d) => d.dayNumber));
  }, [cycleDayInputs]);

  const {
    engineResult,
    interpretation,
    postShiftMonitoring,
    isLoading: interpretationLoading,
    keepWatchingDismissed,
    onKeepWatching,
    actions: interpretationActions,
  } = useInterpretation({
    cycleId,
    days: cycleDayInputs,
    cycleIsActive: cycle?.isActive ?? false,
    markedAnovulatoryAt: (cycle as any)?.markedAnovulatoryAt ?? null,
    markedUninterpretableAt: (cycle as any)?.markedUninterpretableAt ?? null,
  });

  // Determine how many days to show on the chart.
  const recordedMaxDay = useMemo(() => {
    if (!cycle || cycle.days.length === 0) return 0;
    return Math.max(...cycle.days.map((day: any) => day.dayNumber));
  }, [cycle]);

  const displayDayRange = useMemo(() => {
    if (!cycle) {
      return { minDay: 1, maxDay: 28 };
    }
    // Unified formula: every cycle (active or ended) shows at least 28 days.
    // For ended cycles where recordedMaxDay < 28, cells [recordedMaxDay+1..28]
    // form the gray tail (see isCycleDayInTail). For long cycles
    // (recordedMaxDay > 28), the range expands naturally to recordedMaxDay.
    return { minDay: 1, maxDay: Math.max(28, recordedMaxDay) };
  }, [cycle, recordedMaxDay]);

  const chartData = useMemo(() => {
    if (!settings || !cycle) return null;

    const tempUnit = settings.temperatureUnit;
    
    // Create a map of day numbers to day data for quick lookup
    const allBBTDaysMap = new Map(
      allDaysWithBBT.map((day: any) => [day.dayNumber, day])
    );

    // Build all data points with metadata
    const allPoints: Array<{x: number, y: number, isExcluded: boolean, dayNumber: number}> = [];
    
    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const day = allBBTDaysMap.get(dayNumber);
      
      if (day && day.bbt !== null) {
        const tempValue = toDisplayTemperature(day.bbt!, tempUnit);
        
        allPoints.push({ 
          x: dayNumber, 
          y: tempValue,
          isExcluded: day.excludeFromInterpretation,
          dayNumber
        });
      }
    }

    // Build solid line series from non-excluded points only.
    // Excluded points are skipped entirely — non-excluded points connect directly.
    const includedPoints = allPoints.filter(p => !p.isExcluded);
    const excludedPoints = allPoints.filter(p => p.isExcluded);

    // All included points form a single continuous solid line
    const solidSegments: Array<{x: number, y: number}>[] = [];
    if (includedPoints.length > 0) {
      solidSegments.push(includedPoints.map(p => ({ x: p.x, y: p.y })));
    }

    // Build series array: solid segments + one series for excluded points (no connecting lines)
    const series = [
      ...solidSegments.map((segment, index) => ({
        name: `BBT-${index}`,
        data: segment
      })),
      // Excluded points as a separate series so they remain hoverable for tooltip/crosshair
      ...(excludedPoints.length > 0 ? [{
        name: 'Excluded',
        data: excludedPoints.map(p => ({ x: p.x, y: p.y }))
      }] : [])
    ];

    const hasExcludedSeries = excludedPoints.length > 0;

    return {
      series,
      minDay: displayDayRange.minDay,
      maxDay: displayDayRange.maxDay,
      numSolidSegments: solidSegments.length,
      hasExcludedSeries,
      excludedPoints,
      allPoints: allPoints,
      allDaysMap: allBBTDaysMap
    };
  }, [cycle, displayDayRange, allDaysWithBBT, settings]);

  // Create a map of day numbers to week day abbreviations across the displayed range.
  const weekDaysMap = useMemo(() => {
    if (!cycle) return new Map<number, string>();
    
    const map = new Map<number, string>();
    const startDate = new Date(cycle.startDate);

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (dayNumber - 1));
      const abbreviation = getDayOfWeekAbbreviationChip(getDayOfWeek(date));
      map.set(dayNumber, abbreviation);
    }

    return map;
  }, [cycle, displayDayRange]);

  const annotationData = useMemo(() => {
    return getChartAnnotations(
      cycleDayInputs,
      interpretation,
      engineResult?.thermalShift ?? null,
    );
  }, [cycleDayInputs, interpretation, engineResult]);

  // Coverline data for the custom React overlay (replaces the
  // annotations.yaxis entry, which spanned the full plot width and
  // drew through the gray tail). See spec section "BBT plot zone".
  //
  // IMPORTANT: guard !settings and !cycle at the top — this memo runs
  // before the component's loading-return when only some deps have
  // arrived, and we deref settings.temperatureUnit / cycle.* below.
  const coverlineOverlay = useMemo(() => {
    if (!settings || !cycle || !interpretation || !engineResult) return null;
    const shift = engineResult.thermalShift;
    const state = interpretation.state;

    const coverlineC = getActiveCoverline(cycleDayInputs, interpretation, shift);
    const isMarked =
      !!(cycle as any).markedAnovulatoryAt || !!(cycle as any).markedUninterpretableAt;
    if (coverlineC == null || state === 'DISMISSED' || isMarked) return null;

    const coverlineDisplay = toDisplayTemperature(coverlineC, settings.temperatureUnit);

    const styleMap: Record<string, { color: string; dash: number; opacity: number }> = {
      SUGGESTED: { color: '#8b5cf6', dash: 6, opacity: 0.6 },
      CONFIRMED: { color: '#059669', dash: 0, opacity: 1 },
      ADJUSTED: { color: '#d97706', dash: 0, opacity: 1 },
    };
    const style = styleMap[state] ?? styleMap.SUGGESTED;

    return {
      yValue: coverlineDisplay,
      labelText: formatTemperature(coverlineC, settings.temperatureUnit),
      color: style.color,
      dash: style.dash,
      opacity: style.opacity,
    };
  }, [settings, cycle, interpretation, engineResult, cycleDayInputs]);

  // Calculate dynamic Y-axis range based on actual data (including excluded points)
  const yAxisRange = useMemo(() => {
    if (!chartData || !settings) return null;

    // Collect all temperature values from all series (includes both solid and excluded)
    const allTemperatures = chartData.series.flatMap(series => 
      series.data.map((point: {x: number, y: number}) => point.y)
    );

    // Default ranges
    const defaultRange = settings.temperatureUnit === 'CELSIUS' 
      ? { min: 36.0, max: 37.5 }
      : { min: 96.8, max: 99.5 }; // Equivalent Fahrenheit range

    if (allTemperatures.length === 0) {
      return defaultRange;
    }

    const actualMin = Math.min(...allTemperatures);
    const actualMax = Math.max(...allTemperatures);

    // Use the wider range to ensure all data points are visible (including excluded ones)
    const min = Math.min(defaultRange.min, actualMin);
    let max = Math.max(defaultRange.max, actualMax);

    // Headroom for the thermal-shift chevrons — only when chevrons will
    // actually render. DISMISSED / engine-none cycles must keep the existing
    // chart layout, so we leave yAxisRange untouched in that case.
    //
    // Chevron apex sits 28 px above the dot, plus a small top margin (~10 px)
    // so the apex doesn't kiss the plot border. Total ≥38 px clearance from
    // the highest dot to the top of the plot.
    // Solving the px↔temp equation *after* the bump widens the range gives:
    //   bump = (HEADROOM_PX × range) / (plotHeight − HEADROOM_PX)
    //
    // Use the measured plotAreaHeight when the ResizeObserver has populated
    // it. Before that fires (initial render), fall back to a deliberately
    // small height (280 px) — smaller-than-real means a bigger-than-needed
    // first bump, which clears the chevrons safely even if the real measured
    // plot turns out smaller than expected.
    //
    // Convergence note: this memo depends on plotAreaHeight, but the chart's
    // plot area height is itself a function of yAxisRange (label-column width).
    // The loop terminates because our bump shifts max by ~0.14 °C / ~0.25 °F
    // — below the y-axis label precision (toFixed(1) / toFixed(2) at lines
    // ~739-743), so ApexCharts renders the same label strings and does not
    // re-measure the label column. If you upgrade ApexCharts or change the
    // label precision, re-verify this convergence.
    if (annotationData) {
      const HEADROOM_PX = 38;
      const FALLBACK_PLOT_HEIGHT_PX = 280;
      const effectivePlotHeight =
        plotAreaHeight > 0 ? plotAreaHeight : FALLBACK_PLOT_HEIGHT_PX;
      const range = max - min;
      const bumpTempUnits =
        (HEADROOM_PX * range) / (effectivePlotHeight - HEADROOM_PX);
      if (max - actualMax < bumpTempUnits) {
        max += bumpTempUnits;
      }
    }

    return { min, max };
  }, [chartData, settings, annotationData, plotAreaHeight]);

  // Compute days with no BBT recording that fall between two consecutive included BBT points.
  // Used to render a small × on the connecting line at the interpolated temperature position.
  const missingBBTDaysOnLine = useMemo(() => {
    if (!chartData || !settings) return [];

    const included = Array.from(chartData.allDaysMap.values())
      .filter((d: any) => !d.excludeFromInterpretation)
      .sort((a: any, b: any) => a.dayNumber - b.dayNumber);

    if (included.length < 2) return [];

    const result: Array<{ dayNumber: number; interpolatedTemp: number }> = [];

    for (let i = 0; i < included.length - 1; i++) {
      const p1 = included[i];
      const p2 = included[i + 1];
      for (let day = p1.dayNumber + 1; day < p2.dayNumber; day++) {
        const existing = chartData.allDaysMap.get(day);
        // Only mark days with no BBT at all; excluded days already show a grey dot
        if (!existing || existing.bbt === null) {
          const t = (day - p1.dayNumber) / (p2.dayNumber - p1.dayNumber);
          const t1 = toDisplayTemperature(p1.bbt, settings.temperatureUnit);
          const t2 = toDisplayTemperature(p2.bbt, settings.temperatureUnit);
          result.push({ dayNumber: day, interpolatedTemp: t1 + (t2 - t1) * t });
        }
      }
    }
    return result;
  }, [chartData, settings]);

  // Build labels for dates across the full displayed range using the cycle
  // start date. Each value is just the day-of-month (1..31) as a string;
  // the calendar month is now communicated by the gutter pill above the row.
  const datesMap = useMemo(() => {
    if (!cycle) return new Map<number, string>();

    const map = new Map<number, string>();
    const startDate = new Date(cycle.startDate);

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (dayNumber - 1));
      map.set(dayNumber, String(date.getDate()));
    }

    return map;
  }, [cycle, displayDayRange]);

  // Minimum chart-container width — guarantees cellWidth ≥ 22 px so the
  // weekday/cycle-day chips fit, even on 40-50 day cycles or with wider
  // y-axis labels (e.g. some Celsius/Fahrenheit values). Uses the
  // runtime-measured plotAreaOffset when available, falling back to a
  // conservative reserve before the first Apex measurement.
  const containerMinWidth = useMemo(() => {
    const numDays = displayDayRange.maxDay - displayDayRange.minDay + 1;
    return computeContainerMinWidth(numDays, plotAreaOffset);
  }, [displayDayRange, plotAreaOffset]);

  // One element per contiguous calendar-month segment of the displayed range.
  // Drives the month-label pills in the gutter row.
  //
  // Cycle-relative coloring contract: monthIndex 0 == cycle's first calendar
  // month, 1 == second, etc. This only holds because displayDayRange.minDay
  // is always 1 in the current chart. If that ever changes (e.g. a "month 2
  // onwards" detail view), update buildMonthSpans usage to offset monthIndex
  // by the number of months skipped — see MonthSpan JSDoc in utils.ts.
  const monthSpans = useMemo(() => {
    if (!cycle) return [];
    // Defensive assertion: today's chart always passes minDay=1; if a future
    // change breaks that, the colors will silently shift, so fail loudly.
    if (displayDayRange.minDay !== 1) {
      console.warn(
        'CycleChartPage: monthSpans assumes displayDayRange.minDay === 1 for cycle-relative coloring; got',
        displayDayRange.minDay,
      );
    }
    // For ended cycles, clamp the gutter range to recordedMaxDay so colored
    // month pills don't render over the gray tail. Active cycles keep the
    // full displayDayRange — their padded [recordedMaxDay+1..28] cells render
    // in full color (today's behavior). Long ended cycles
    // (recordedMaxDay >= 28) get a no-op clamp.
    const gutterMaxDay = cycle.isActive
      ? displayDayRange.maxDay
      : Math.min(displayDayRange.maxDay, recordedMaxDay);
    return buildMonthSpans(
      new Date(cycle.startDate),
      displayDayRange.minDay,
      gutterMaxDay,
    );
  }, [cycle, displayDayRange, recordedMaxDay]);

  // Lookup: dayNumber -> monthIndex (0 for 1st month of cycle, 1 for 2nd, ...).
  // Drives per-cell color selection (date underline, weekday chip, cycle-day
  // chip, hover wash) without re-scanning monthSpans on every cell.
  const monthIndexByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const span of monthSpans) {
      for (let d = span.startDayNumber; d <= span.endDayNumber; d++) {
        map.set(d, span.monthIndex);
      }
    }
    return map;
  }, [monthSpans]);

  // Create a map of ALL cycle days (not just BBT days) for cervical/menstrual data
  const allCycleDaysMap = useMemo(() => {
    if (!cycle) return new Map();
    return new Map(cycle.days.map((day: any) => [day.dayNumber, day]));
  }, [cycle]);

  // Create a map of day numbers to parsed time data for BBT timestamps
  const timeStampsMap = useMemo(() => {
    if (!cycle || !chartData) return new Map<number, { hours: string; minutes: string } | null>();

    const map = new Map<number, { hours: string; minutes: string } | null>();

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const day = chartData.allDaysMap.get(dayNumber);
      if (day?.bbtTime) {
        // Parse "HH:MM" format
        const [hours, minutes] = day.bbtTime.split(':');
        map.set(dayNumber, { hours, minutes });
      } else {
        map.set(dayNumber, null);
      }
    }

    return map;
  }, [cycle, chartData, displayDayRange]);

  // Notes row sizing (cervical-fluid bar helpers now live in ./utils)
  const NOTES_ROW_HEIGHT = notesRowExpanded ? 120 : 28;
  const LOWER_TABLE_PADDING_BOTTOM = 262 + NOTES_ROW_HEIGHT;

  // Create a map of day numbers to disturbance factors
  const disturbanceMap = useMemo(() => {
    if (!cycle) return new Map<number, { factors: string[]; travelTimeDiff: number | null }>();

    const map = new Map<number, { factors: string[]; travelTimeDiff: number | null }>();

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const day = allCycleDaysMap.get(dayNumber);
      map.set(dayNumber, {
        factors: day?.disturbanceFactors ?? [],
        travelTimeDiff: day?.travelTimeDiff ?? null,
      });
    }

    return map;
  }, [cycle, allCycleDaysMap, displayDayRange]);

  // Create a map of day numbers to cervical fluid and menstrual data
  const cervicalMenstrualMap = useMemo(() => {
    if (!cycle) return new Map();

    const map = new Map<number, {
      cervicalAppearance: string | null;
      menstrualFlow: string | null;
    }>();

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const day = allCycleDaysMap.get(dayNumber);
      map.set(dayNumber, {
        cervicalAppearance: day?.cervicalAppearance || null,
        menstrualFlow: day?.menstrualFlow || null
      });
    }

    return map;
  }, [cycle, allCycleDaysMap, displayDayRange]);

  // Create a map of day numbers to OPK status
  const opkStatusMap = useMemo(() => {
    if (!cycle || !chartData) return new Map<number, string | null>();

    const map = new Map<number, string | null>();

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const day = allCycleDaysMap.get(dayNumber);
      map.set(dayNumber, day?.opkStatus || null);
    }

    return map;
  }, [cycle, chartData, allCycleDaysMap, displayDayRange]);

  // Map of day numbers to whether they have ANY recorded data
  const daysWithDataMap = useMemo(() => {
    if (!cycle || !chartData) return new Map<number, boolean>();
    const map = new Map<number, boolean>();
    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const day = allCycleDaysMap.get(dayNumber);
      const hasBBT = chartData.allDaysMap.has(dayNumber);
      const hasTime = timeStampsMap.get(dayNumber) !== null;
      const hasOPK = opkStatusMap.get(dayNumber) !== null;
      const hasIntercourse = !!day?.hadIntercourse;
      const cfData = cervicalMenstrualMap.get(dayNumber);
      const hasCF = !!cfData?.cervicalAppearance;
      const hasMenstrual = !!cfData?.menstrualFlow;
      const hasDisturbance = (day?.disturbanceFactors?.length ?? 0) > 0;
      map.set(dayNumber, hasBBT || hasTime || hasOPK || hasIntercourse || hasCF || hasMenstrual || hasDisturbance);
    }
    return map;
  }, [cycle, chartData, allCycleDaysMap, timeStampsMap, opkStatusMap, cervicalMenstrualMap, displayDayRange]);

  // Immediately dismiss tooltip and crosshair — all state cleared synchronously.
  const dismissTooltip = () => {
    setHoveredDayNumber(null);
    setCrosshairX(null);
    pinnedDayNumberRef.current = null;
    pinnedCrosshairXRef.current = null;
    setPinnedDayNumber(null);
    setPinnedCrosshairX(null);
  };

  // Shared hover handler for custom cells
  const handleCellMouseEnter = (dayNumber: number) => {
    if (!chartData || plotAreaWidth === 0) return;
    setHoveredDayNumber(dayNumber);
    const numDays = chartData.maxDay - chartData.minDay + 1;
    const cellWidth = plotAreaWidth / numDays;
    const dayIndex = dayNumber - chartData.minDay;
    setCrosshairX(plotAreaOffset + (dayIndex + 0.5) * cellWidth);
  };
  // No-op: tooltip persists until an explicit user action (click away / tap outside).
  const handleCellMouseLeave = () => {};

  // Pins or unpins the tooltip for a given day number.
  // Called on click (canvas and grid cells) and on touch (all rows).
  const handleCellClick = (dayNumber: number) => {
    if (!chartData || plotAreaWidth === 0) return;
    if (!daysWithDataMap.get(dayNumber)) return;

    if (pinnedDayNumberRef.current === dayNumber) {
      // Same day clicked again — unpin
      pinnedDayNumberRef.current = null;
      pinnedCrosshairXRef.current = null;
      setPinnedDayNumber(null);
      setPinnedCrosshairX(null);
    } else {
      const numDays = chartData.maxDay - chartData.minDay + 1;
      const cellWidth = plotAreaWidth / numDays;
      const dayIndex = dayNumber - chartData.minDay;
      const x = plotAreaOffset + (dayIndex + 0.5) * cellWidth;
      pinnedDayNumberRef.current = dayNumber;
      pinnedCrosshairXRef.current = x;
      setPinnedDayNumber(dayNumber);
      setPinnedCrosshairX(x);
    }
  };

  // Refs to hold the latest handler functions so the canvas useEffect (registered
  // only when dependencies change) always calls through to up-to-date closures.
  const handleCellMouseEnterRef = useRef(handleCellMouseEnter);
  const handleCellClickRef = useRef(handleCellClick);
  const dismissTooltipRef = useRef(dismissTooltip);
  useEffect(() => {
    handleCellMouseEnterRef.current = handleCellMouseEnter;
    handleCellClickRef.current = handleCellClick;
    dismissTooltipRef.current = dismissTooltip;
  });

  const chartOptions: ApexOptions = useMemo(() => {
    if (!settings || !cycle || !yAxisRange || !chartData) return {};
    
    const tempUnit = settings.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
    
    // Set Y-axis range and intervals based on temperature unit
    // Calculate tickAmount dynamically to show 0.1 degree increments
    const tempRange = yAxisRange.max - yAxisRange.min;
    const tickAmount = Math.min(Math.max(Math.round(tempRange / 0.1), 8), 30);
    
    const yAxisConfig = settings.temperatureUnit === 'CELSIUS' ? {
      min: yAxisRange.min,
      max: yAxisRange.max,
      tickAmount: tickAmount,
      decimalsInFloat: 1
    } : {
      min: yAxisRange.min,
      max: yAxisRange.max,
      tickAmount: tickAmount,
      decimalsInFloat: 2
    };
    
    return {
      chart: {
        type: 'line',
        height: 400,
        toolbar: {
          show: false // Hide toolbar, we've moved controls to the header
        },
        zoom: {
          enabled: false
        },
        animations: {
          enabled: true,
          dynamicAnimation: {
            enabled: true
          }
        },
        foreColor: '#002142', // Set default text color for axis labels
        background: 'transparent', // empty plot-area pixels so the gray-tail overlay behind the SVG shows through
      },
      theme: {
        mode: 'light',
        palette: 'palette1',
        monochrome: {
          enabled: false
        }
      },
      legend: {
        show: false // Hide legend since we may have multiple internal series (BBT-0, etc.)
      },
      grid: {
        padding: {
          // NOTE: If you change `left`, also revisit LEFT_PLOT_RESERVE_FALLBACK
          // in utils.ts — the chart's min-w math depends on this value.
          left: 50,
          // NOTE: If you change `right`, also update RIGHT_PLOT_RESERVE in
          // utils.ts — the chart's min-w math reserves exactly this many px.
          right: 40,
        },
        show: true,
        clipMarkers: false, // Don't clip markers at the edge
        xaxis: {
          lines: {
            show: false // Hide vertical grid lines - we use custom table borders instead
          }
        }
      },
      annotations: {
        yaxis: [], // Coverline moved to a custom React overlay — see "Coverline overlay" below.
      },
      colors: [
        ...Array(chartData.numSolidSegments).fill('#3b82f6'), // Blue for solid segments
        ...(chartData.hasExcludedSeries ? ['#6B7280'] : [])   // Darker grey for excluded (better text contrast)
      ],
      stroke: {
        curve: 'straight',
        width: [
          ...Array(chartData.numSolidSegments).fill(1.5),     // Width 1.5 for solid
          ...(chartData.hasExcludedSeries ? [0] : [])          // Width 0 for excluded (no connecting lines)
        ],
        dashArray: [
          ...Array(chartData.numSolidSegments).fill(0),        // Solid lines
          ...(chartData.hasExcludedSeries ? [0] : [])
        ]
      },
      fill: {
        opacity: 1
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => getTempNodeLabel(val) ?? '',
        style: {
          fontSize: '11px',
          fontWeight: 400,
          colors: ['#002142'],
        },
        offsetY: -1,
        background: { enabled: false },
      },
      markers: {
        size: [
          ...Array(chartData.numSolidSegments).fill(7),
          ...(chartData.hasExcludedSeries ? [7] : [])
        ],
        colors: [
          ...Array(chartData.numSolidSegments).fill('#ffffff'),
          ...(chartData.hasExcludedSeries ? ['#ffffff'] : [])
        ],
        fillOpacity: 1,
        strokeWidth: 1.5,
        strokeColors: [
          ...Array(chartData.numSolidSegments).fill('#3b82f6'),
          ...(chartData.hasExcludedSeries ? ['#6B7280'] : [])
        ],
        hover: {
          size: 9,
          sizeOffset: 0
        }
      },
      xaxis: {
        type: 'numeric',
        title: {
          text: undefined
        },
        min: chartData.minDay - 0.5, // Start half a unit before first day
        max: chartData.maxDay + 0.5, // End half a unit after last day
        tickAmount: chartData.maxDay - chartData.minDay, // One tick per day
        floating: false,
        position: 'top',
        labels: {
          show: false, // Hide x-axis labels since we show them in the custom grid
          formatter: (value: string) => Math.round(Number(value)).toString()
        },
        axisBorder: {
          show: false // Hide axis border
        },
        axisTicks: {
          show: false // Hide axis ticks
        },
        crosshairs: {
          show: false // Explicitly disable x-axis crosshairs
        },
        tooltip: {
          enabled: false // Disable x-axis tooltip that might show day number
        }
      },
      yaxis: {
        title: {
          text: `Temperature (${tempUnit})`,
          offsetX: -30, // Push title further to the left to create more space from labels
          style: {
            fontSize: '14px',
            fontWeight: 600,
            color: '#002142'
          }
        },
        min: yAxisConfig.min,
        max: yAxisConfig.max,
        tickAmount: yAxisConfig.tickAmount,
        decimalsInFloat: yAxisConfig.decimalsInFloat,
        labels: {
          formatter: (value: number) => {
            // Format based on unit (Celsius: 1 decimal, Fahrenheit: 2 decimals)
            return settings.temperatureUnit === 'CELSIUS' 
              ? value.toFixed(1) 
              : value.toFixed(2);
          },
          style: {
            fontSize: '11px'
          },
          offsetX: 40 // Compensate for increased padding to keep labels close to plot area
        }
      },
      tooltip: {
        enabled: false // Disabled - using custom React tooltip + native mousemove listener
      }
    };
  }, [settings, chartData, allDaysWithBBT, cycle, navigate, yAxisRange, plotAreaWidth, plotAreaOffset]);

  const prevCycle = useMemo(() => {
    if (!cycle || !allCycles) return null;
    const currentIndex = allCycles.findIndex(c => c.id === cycle.id);
    return currentIndex > 0 ? allCycles[currentIndex - 1] : null;
  }, [cycle, allCycles]);

  const nextCycle = useMemo(() => {
    if (!cycle || !allCycles) return null;
    const currentIndex = allCycles.findIndex(c => c.id === cycle.id);
    return currentIndex < allCycles.length - 1 ? allCycles[currentIndex + 1] : null;
  }, [cycle, allCycles]);

  // Handle chart container resize and measure plot area dimensions
  useEffect(() => {
    const updatePlotAreaDimensions = () => {
      if (chartContainerRef.current) {
        // Find the Apex grid rect — this is the actual dot-placement region.
        // `.apexcharts-inner` is ~5 px wider than `.apexcharts-grid` (it
        // includes a small right-side gap), so using inner caused overlay
        // dots/halos to drift off-centre by up to ~5 px at the right edge.
        // Querying the grid keeps overlays exactly aligned with chart dots.
        const plotArea = chartContainerRef.current.querySelector('.apexcharts-grid');
        if (plotArea) {
          const containerRect = chartContainerRef.current.getBoundingClientRect();
          const plotRect = plotArea.getBoundingClientRect();

          // Calculate offset and width relative to container
          const offset = plotRect.left - containerRect.left;
          setPlotAreaOffset(offset);
          setPlotAreaWidth(plotRect.width);
          setPlotAreaHeight(plotRect.height);

          // NEW: Measure plot area top position (includes upper table + any padding)
          const plotAreaTopPosition = plotRect.top - containerRect.top;
          setPlotAreaTop(plotAreaTopPosition);

          // NEW: Measure the actual chart height for dynamic positioning
          const chartSvg = chartContainerRef.current.querySelector('.apexcharts-svg');
          if (chartSvg) {
            const chartRect = chartSvg.getBoundingClientRect();
            setChartHeight(chartRect.height);
          }
        }
      }
    };

    // Initial measurement with delay to ensure chart is rendered
    const timer = setTimeout(updatePlotAreaDimensions, 300);

    // Setup resize observer
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updatePlotAreaDimensions, 100);
    });
    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [chartData]);

  // Native mousemove/mouseleave on the ApexCharts canvas to drive crosshair+tooltip
  // for BBT node hover (ApexCharts' dataPointMouseEnter event is unreliable).
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !chartData || plotAreaWidth === 0) return;

    // Track the current canvas and a MutationObserver so we can re-attach
    // listeners if ApexCharts replaces its DOM (e.g. after a React Query refetch).
    let currentCanvas: HTMLElement | null = null;
    let canvasCleanup: (() => void) | null = null;

    // Resolves a pointer/touch coordinate to the corresponding day and shows
    // the tooltip. Also updates lastTouchedDayRef for touch pin logic.
    // Out-of-bounds coordinates are silently ignored — tooltip stays visible.
    // When `tolerant` is true, Y-bounds are expanded to make touch targeting
    // more forgiving (fingers are imprecise).
    const resolveDay = (clientX: number, clientY: number, tolerant = false) => {
      const containerRect = container.getBoundingClientRect();
      const mouseX = clientX - containerRect.left;
      const mouseY = clientY - containerRect.top;

      // Allow 30px tolerance above/below the plot area for touch interactions
      const yPad = tolerant ? 30 : 0;
      if (
        mouseY < plotAreaTop - yPad || mouseY > plotAreaTop + plotAreaHeight + yPad ||
        mouseX < plotAreaOffset || mouseX > plotAreaOffset + plotAreaWidth
      ) {
        // Out of bounds — keep tooltip showing at the last day, reset touch day.
        lastTouchedDayRef.current = null;
        return;
      }

      const numDays = chartData.maxDay - chartData.minDay + 1;
      const cellWidth = plotAreaWidth / numDays;
      const dayIndex = Math.floor((mouseX - plotAreaOffset) / cellWidth);
      const dayNumber = chartData.minDay + Math.min(dayIndex, numDays - 1);

      // Tail guard: in the gray tail of an ended short cycle, no tooltip
      // or crosshair — the cell is decorative, not interactive. This is
      // stricter than the daysWithDataMap check immediately below because
      // it explicitly says "we mean for the tail to be inert," surviving
      // any future change to daysWithDataMap's semantics.
      if (cycle && isCycleDayInTail(cycle, dayNumber, recordedMaxDay)) {
        lastTouchedDayRef.current = null;
        dismissTooltipRef.current();
        return;
      }

      if (daysWithDataMap.get(dayNumber)) {
        lastTouchedDayRef.current = dayNumber;
        handleCellMouseEnterRef.current(dayNumber);
      } else {
        lastTouchedDayRef.current = null;
        dismissTooltipRef.current();
      }
    };

    const handleMouseMove = (e: MouseEvent) => resolveDay(e.clientX, e.clientY);
    // Mouse leaving the canvas does not dismiss — tooltip stays until click away.
    const handleMouseLeave = () => {};

    const handleClick = (e: MouseEvent) => {
      // Discard the synthetic click that mobile browsers fire after touchend.
      if (Date.now() - lastTouchEndTimeRef.current < 600) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      if (
        mouseY < plotAreaTop || mouseY > plotAreaTop + plotAreaHeight ||
        mouseX < plotAreaOffset || mouseX > plotAreaOffset + plotAreaWidth
      ) {
        // Click within canvas but outside the plot area — dismiss everything.
        dismissTooltipRef.current();
        return;
      }

      const numDays = chartData.maxDay - chartData.minDay + 1;
      const cellWidth = plotAreaWidth / numDays;
      const dayIndex = Math.floor((mouseX - plotAreaOffset) / cellWidth);
      const dayNumber = chartData.minDay + Math.min(dayIndex, numDays - 1);
      if (cycle && isCycleDayInTail(cycle, dayNumber, recordedMaxDay)) {
        // Click in the gray tail of an ended cycle — inert.
        dismissTooltipRef.current();
        return;
      }
      handleCellClickRef.current(dayNumber);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartXRef.current = touch.clientX;
      touchStartYRef.current = touch.clientY;
      isTouchScrollingRef.current = false;
      lastTouchedDayRef.current = null;
      const containerRect = container.getBoundingClientRect();
      cursorXRef.current = touch.clientX - containerRect.left;
      cursorYRef.current = touch.clientY - containerRect.top;
      // Use tolerant=true for touch to expand Y hit area for imprecise fingers
      resolveDay(touch.clientX, touch.clientY, true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      // Update cursor position for tooltip placement
      const containerRect = container.getBoundingClientRect();
      cursorXRef.current = touch.clientX - containerRect.left;
      cursorYRef.current = touch.clientY - containerRect.top;

      const dxScrolling = touchStartXRef.current !== null &&
        Math.abs(touch.clientX - touchStartXRef.current) > 10;
      const dyScrolling = touchStartYRef.current !== null &&
        Math.abs(touch.clientY - touchStartYRef.current) > 10;

      if (dxScrolling || dyScrolling) {
        // Scroll detected (horizontal or vertical) — dismiss tooltip immediately.
        isTouchScrollingRef.current = true;
        dismissTooltipRef.current();
        return;
      }
      resolveDay(touch.clientX, touch.clientY, true);
    };

    const handleTouchEnd = () => {
      // Record time so the subsequent synthetic click can be suppressed.
      lastTouchEndTimeRef.current = Date.now();

      if (isTouchScrollingRef.current) {
        // Already dismissed in touchmove — just reset state.
        isTouchScrollingRef.current = false;
        lastTouchedDayRef.current = null;
        touchStartXRef.current = null;
        touchStartYRef.current = null;
        return;
      }

      // Pin the tooltip on the tapped day. On touch, always pin (don't toggle
      // off) — tapping the same day should keep the tooltip visible so the user
      // can interact with the Edit button. Tapping outside dismisses instead.
      const day = lastTouchedDayRef.current;
      if (day !== null) {
        // Always pin (no toggle) — force-set pinned state directly
        const numDays = chartData.maxDay - chartData.minDay + 1;
        const cellWidth = plotAreaWidth / numDays;
        const dayIndex = day - chartData.minDay;
        const x = plotAreaOffset + (dayIndex + 0.5) * cellWidth;
        pinnedDayNumberRef.current = day;
        pinnedCrosshairXRef.current = x;
        setPinnedDayNumber(day);
        setPinnedCrosshairX(x);
      } else {
        dismissTooltipRef.current();
      }

      isTouchScrollingRef.current = false;
      lastTouchedDayRef.current = null;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
    };

    // Dismiss when the user clicks/taps anywhere outside the chart container.
    // Use touchstart for mobile so it fires at the right time in the event
    // sequence and doesn't race with the canvas touch handlers.
    const handleDocumentPointerDown = (e: PointerEvent) => {
      // Ignore touch-originated pointer events — handled by touchstart below
      if (e.pointerType === 'touch') return;
      if (
        chartContainerRef.current &&
        !chartContainerRef.current.contains(e.target as Node)
      ) {
        dismissTooltipRef.current();
      }
    };

    const handleDocumentTouchStart = (e: TouchEvent) => {
      if (
        chartContainerRef.current &&
        !chartContainerRef.current.contains(e.target as Node)
      ) {
        dismissTooltipRef.current();
      }
    };

    // Attach all canvas-level listeners to the given element and return a
    // cleanup function that removes them.
    const attachToCanvas = (canvas: HTMLElement) => {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
      canvas.addEventListener('click', handleClick);
      canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
        canvas.removeEventListener('click', handleClick);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
      };
    };

    // Try to find the canvas and attach listeners.  If ApexCharts hasn't
    // rendered yet (or replaced its DOM after a refetch) we watch for it via
    // a MutationObserver so listeners are always attached.
    const tryAttach = () => {
      const canvas = container.querySelector('.apexcharts-canvas') as HTMLElement | null;
      if (!canvas || canvas === currentCanvas) return;
      // Detach from the old canvas if it was replaced
      canvasCleanup?.();
      currentCanvas = canvas;
      canvasCleanup = attachToCanvas(canvas);
    };

    tryAttach();

    // Watch for child-list changes so we can re-attach when ApexCharts
    // rebuilds its DOM (e.g. after a React Query background refetch).
    const observer = new MutationObserver(tryAttach);
    observer.observe(container, { childList: true, subtree: true });

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('touchstart', handleDocumentTouchStart, { passive: true });
    return () => {
      observer.disconnect();
      canvasCleanup?.();
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('touchstart', handleDocumentTouchStart);
    };
  }, [chartData, plotAreaWidth, plotAreaOffset, plotAreaTop, plotAreaHeight, daysWithDataMap, cycle, recordedMaxDay]);


  if (cycleLoading || settingsLoading) {
    return (
      <div className="flex">
        <SideNav />
        <div className="flex-1 p-4 md:p-8">
          <div className="text-center">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="flex">
        <SideNav />
        <div className="flex-1 p-4 md:p-8">
          <div className="text-center">
            <p className="mb-4">Cycle not found or you haven&apos;t started any cycles yet.</p>
            <Link to="/cycles">
              <Button>Go to My Cycles</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <SideNav />
      <div className="flex-1 p-4 md:p-8 max-w-6xl">
      <div className="mb-4 md:mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold mb-2 flex items-center gap-2">
            <span>Cycle #{cycle.cycleNumber}{getCycleDayCount(cycle) > 0 && `: ${getCycleDayCount(cycle)} ${cycle.isActive ? 'days recorded' : 'days'}`}</span>
            <CycleBadge
              markedAnovulatoryAt={(cycle as any).markedAnovulatoryAt ?? null}
              markedUninterpretableAt={(cycle as any).markedUninterpretableAt ?? null}
            />
          </h1>
          <p className="text-muted-foreground">
            Started: {formatDateLong(new Date(cycle.startDate))}
            {cycle.endDate && ` - Ended: ${formatDateLong(new Date(cycle.endDate))}`}
          </p>
        </div>
        <Link to="/cycles/new">
          <Button variant="default">
            <span className="sm:hidden">Cycle +</span>
            <span className="hidden sm:inline">Begin new cycle</span>
          </Button>
        </Link>
      </div>

      {cycle.isActive && (
        <CrossCycleAnovulatoryBanner previousCycle={previousCycle ?? null} />
      )}

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Temperature Chart</CardTitle>
          <div className="flex items-center gap-2">
            <Link to={`/cycles/${cycle.id}/days`}>
              <Button variant="outline" size="sm" className="hover:bg-[#002142] hover:text-white" aria-label="View Days">
                <svg className="w-4 h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span className="hidden sm:inline">View Days</span>
              </Button>
            </Link>
            <Link to={`/cycles/${cycle.id}/add-day`}>
              <Button variant="outline" size="sm" aria-label="Add a Day">
                <svg className="w-4 h-4 sm:mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <span className="hidden sm:inline">Add a Day</span>
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <style>{`
            .apexcharts-yaxis-label,
            .apexcharts-yaxis-title-text {
              fill: #002142 !important;
            }
            /* Prevent ApexCharts internal elements from intercepting touch/pointer
               events — our custom canvas-level listeners handle everything. */
            .apexcharts-series-markers,
            .apexcharts-marker,
            .apexcharts-data-labels,
            .apexcharts-grid,
            .apexcharts-plot-area {
              pointer-events: none !important;
            }
            .apexcharts-data-labels text,
            .apexcharts-datalabels text {
              dominant-baseline: central !important;
            }
            .cf-cell-pattern {
              background-color: white;
              background-image: url("data:image/svg+xml,%3Csvg width='10' height='10' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0.5' y='0.5' width='9' height='9' rx='2' ry='2' fill='%23e7f1ff'/%3E%3C/svg%3E");
              background-size: 10px 10px;
              background-repeat: repeat;
            }
            .cf-tooltip-trigger {
              position: relative;
            }
            .cf-tooltip-trigger:hover .cf-tooltip-content {
              display: block;
            }
            .cf-tooltip-content {
              display: none;
              position: absolute;
              left: 100%;
              top: 50%;
              transform: translateY(-50%);
              margin-left: 8px;
              background-color: #1f2937;
              color: white;
              padding: 6px 10px;
              border-radius: 4px;
              font-size: 12px;
              white-space: nowrap;
              z-index: 1000;
              box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            }
            .cf-tooltip-content::before {
              content: '';
              position: absolute;
              right: 100%;
              top: 50%;
              transform: translateY(-50%);
              border: 5px solid transparent;
              border-right-color: #1f2937;
            }
          `}</style>
          {chartData ? (
            <div className="overflow-x-auto">
            <div
              ref={chartContainerRef}
              className="relative"
              data-chart-container="cycle-chart"
              style={{ minWidth: `${containerMinWidth}px`, paddingTop: '130px', paddingBottom: `${LOWER_TABLE_PADDING_BOTTOM}px` }}
              onMouseMove={(e) => {
                const rect = chartContainerRef.current?.getBoundingClientRect();
                if (rect) {
                  cursorXRef.current = e.clientX - rect.left;
                  cursorYRef.current = e.clientY - rect.top;
                }
              }}
            >
              {/* Custom X-axis rows with labels */}
              {chartData && plotAreaWidth > 0 && (
                <>
                  {/* Row Labels - positioned in y-axis area */}
                  <div className="absolute top-0 left-0" style={{ width: `${plotAreaOffset}px`, zIndex: 2 }}>
                    {/* Gutter cell — blank; the hairline + month pills live in the gutter overlay container (Task 8). */}
                    <div className="bg-white border-b border-slate-300 border-r border-slate-300" style={{ height: '22px' }} />
                    <div className="flex items-center justify-end px-3 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300" style={{ height: '36px' }}>
                      Date
                    </div>
                    <div className="flex items-center justify-end px-3 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300" style={{ height: '36px' }}>
                      Week Day
                    </div>
                    <div className="flex items-center justify-end px-3 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300" style={{ height: '36px' }}>
                      Cycle Day
                    </div>
                  </div>

                  {/* Gutter overlay — hairline + month-label pills. Lives in
                      the full-chart coord space (left:0 = container's left
                      edge); hairline starts at plotAreaOffset, pills are
                      positioned by monthSpans. */}
                  <div className="absolute top-0 left-0 right-0" style={{ height: '22px', zIndex: 1 }}>
                    {/* Hairline running through the gutter band, plot-area only */}
                    <div
                      className="absolute"
                      style={{
                        left: `${plotAreaOffset}px`,
                        right: 0,
                        top: '11px',
                        height: '1px',
                        background: '#cbd5e1',
                      }}
                    />
                    {/* One pill per calendar-month span */}
                    {monthSpans.map((span) => {
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const spanWidthPx = (span.endDayNumber - span.startDayNumber + 1) * cellWidth;
                      // Pill is anchored at +4 px inset from the span's left edge; reserve 4 px on
                      // the right too so two adjacent pills never visually overlap. Below ~22 px
                      // of pill room (the case where a cycle starts on the last day of a month)
                      // there's no useful label to show, so skip the pill entirely.
                      const pillMaxWidthPx = Math.max(0, spanWidthPx - 8);
                      if (pillMaxWidthPx < 22) return null;

                      // Use the 3-letter abbreviation when the full month name wouldn't fit.
                      // Threshold 68 px = padding (16) + ~52 px of text room for the longest
                      // English month name "September" (~46–50 px at this font), with a small
                      // safety margin so the ellipsis safety net below rarely needs to fire.
                      // Below it, fall back to e.g. "Jan" / "Sep".
                      const useShortLabel = pillMaxWidthPx < 68;
                      const label = useShortLabel ? span.monthLabel.slice(0, 3) : span.monthLabel;

                      const leftEdge = plotAreaOffset + (span.startDayNumber - chartData.minDay) * cellWidth;
                      const palette = paletteFor(span.monthIndex);
                      return (
                        <span
                          key={span.startDayNumber}
                          className="absolute"
                          style={{
                            top: '4px',
                            left: `${leftEdge + 4}px`,
                            maxWidth: `${pillMaxWidthPx}px`,
                            boxSizing: 'border-box',
                            height: '14px',
                            lineHeight: '14px',
                            padding: '0 8px',
                            borderRadius: '9px',
                            background: palette.pillBg,
                            color: palette.pillText,
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Grid cells - calculated positions within plot area */}
                  <div className="absolute top-0" style={{ left: 0, right: 0, zIndex: 1 }}>
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const dateLabel = datesMap.get(dayNumber) || '';
                      const weekDay = weekDaysMap.get(dayNumber) || '';
                      const isHovered = hoveredDayNumber === dayNumber;
                      const dayData = allCycleDaysMap.get(dayNumber);
                      const hasIntercourse = dayData?.hadIntercourse;
                      
                      // Calculate cell position within plot area
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);
                      
                      return (
                        <Fragment key={dayNumber}>
                          {(() => {
                            const monthIndex = monthIndexByDay.get(dayNumber) ?? 0;
                            const palette = paletteFor(monthIndex);
                            const cellBackground = isHovered ? palette.hoverWash : '#ffffff';
                            const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;
                            // Tail-cell colors (slate-50 cell bg, slate-200 chip bg, slate-500 chip text,
                            // slate-400 date text, slate-300 underline). Hover-wash is suppressed on
                            // tail cells — they read as inert empty space.
                            const cellBg = isTail ? '#f8fafc' : cellBackground;
                            const dateTextColor = isTail ? '#94a3b8' : '#334155';
                            const underlineColor = isTail ? '#cbd5e1' : palette.underline;
                            const chipBg = isTail ? '#e2e8f0' : palette.chipBg;
                            const chipTextColor = isTail ? '#64748b' : palette.chipText;
                            return (
                              <>
                                {/* Date cell — flat white with a 2-px colored underline spanning the full cell, inset by 4 px each side */}
                                <div
                                  className="absolute flex items-center justify-center text-xs"
                                  style={{
                                    left: `${leftEdge}px`,
                                    width: `${cellWidth}px`,
                                    top: '22px',
                                    height: '36px',
                                    background: cellBg,
                                    color: dateTextColor,
                                    borderRight: '1px solid #f1f5f9',
                                    borderBottom: '1px solid #e2e8f0',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  {dateLabel}
                                  {/* Full-cell-width 2-px underline (per spec): absolutely
                                      positioned in the cell, NOT inside the text span. */}
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      position: 'absolute',
                                      left: '4px',
                                      right: '4px',
                                      bottom: '4px',
                                      height: '2px',
                                      borderRadius: '1px',
                                      background: underlineColor,
                                    }}
                                  />
                                </div>

                                {/* Week Day cell — flat white, letter wrapped in a colored chip */}
                                <div
                                  className="absolute flex items-center justify-center"
                                  style={{
                                    left: `${leftEdge}px`,
                                    width: `${cellWidth}px`,
                                    top: '58px',
                                    height: '36px',
                                    background: cellBg,
                                    borderRight: '1px solid #f1f5f9',
                                    borderBottom: '1px solid #e2e8f0',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: '20px',
                                      height: '18px',
                                      padding: '0 4px',
                                      borderRadius: '9px',
                                      lineHeight: '18px',
                                      fontSize: '10px',
                                      fontWeight: 400,
                                      background: chipBg,
                                      color: chipTextColor,
                                    }}
                                  >
                                    {weekDay}
                                  </span>
                                </div>

                                {/* Cycle Day cell — flat white, number wrapped in a colored chip; intercourse override = pink text */}
                                <div
                                  className="absolute flex items-center justify-center"
                                  style={{
                                    left: `${leftEdge}px`,
                                    width: `${cellWidth}px`,
                                    top: '94px',
                                    height: '36px',
                                    background: cellBg,
                                    borderRight: '1px solid #f1f5f9',
                                    borderBottom: '1px solid #e2e8f0',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: '20px',
                                      height: '18px',
                                      padding: '0 4px',
                                      borderRadius: '9px',
                                      lineHeight: '18px',
                                      fontSize: '10px',
                                      fontWeight: 400,
                                      background: chipBg,
                                      color: isTail ? chipTextColor : (hasIntercourse ? '#ec4899' : palette.chipText),
                                    }}
                                  >
                                    {dayNumber}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </Fragment>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Green Gradient for Fertile Window - positioned behind chart */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && (() => {
                // Build array of Rising/Peak LH days and sort numerically
                const risingPeakDays: number[] = [];
                for (let dayNumber = chartData.minDay; dayNumber <= chartData.maxDay; dayNumber++) {
                  const opkStatus = opkStatusMap.get(dayNumber);
                  if (opkStatus === 'rising' || opkStatus === 'peak') {
                    risingPeakDays.push(dayNumber);
                  }
                }
                risingPeakDays.sort((a, b) => a - b);

                // Guard: skip if no Rising/Peak days
                if (risingPeakDays.length === 0) return null;

                const numDays = chartData.maxDay - chartData.minDay + 1;
                const cellWidth = plotAreaWidth / numDays;

                return (
                  <>
                    {/* SVG container for gradient rectangles */}
                    <svg
                      className="absolute pointer-events-none"
                      style={{
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 0
                      }}
                    >
                      <defs>
                        <linearGradient id="fertileGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: '#4caf50', stopOpacity: 0.35 }} />
                          <stop offset="100%" style={{ stopColor: '#4caf50', stopOpacity: 0 }} />
                        </linearGradient>
                      </defs>
                      
                      {/* Render one rectangle per Rising/Peak day */}
                      {risingPeakDays.map(dayNumber => {
                        const dayIndex = dayNumber - chartData.minDay;
                        const leftEdge = plotAreaOffset + (dayIndex * cellWidth);
                        
                        // Determine starting y-position for this column
                        let startY = plotAreaTop;
                        const day = chartData.allDaysMap.get(dayNumber);
                        
                        if (day && day.bbt !== null) {
                          // Has BBT: start at temperature point y-position
                          const temp = toDisplayTemperature(day.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT');
                          startY = plotAreaTop + ((yAxisRange.max - temp) / (yAxisRange.max - yAxisRange.min)) * plotAreaHeight;
                        }
                        
                        // Rectangle extends from startY to bottom of plot area
                        const rectHeight = plotAreaTop + plotAreaHeight - startY;

                        return (
                          <rect
                            key={`gradient-${dayNumber}`}
                            x={leftEdge}
                            y={startY}
                            width={cellWidth}
                            height={rectHeight}
                            fill="url(#fertileGradient)"
                          />
                        );
                      })}
                    </svg>
                  </>
                );
              })()}

              {/* Fertile Window Label - positioned behind chart */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && (() => {
                // Build array of Rising/Peak LH days and sort numerically
                const risingPeakDays: number[] = [];
                for (let dayNumber = chartData.minDay; dayNumber <= chartData.maxDay; dayNumber++) {
                  const opkStatus = opkStatusMap.get(dayNumber);
                  if (opkStatus === 'rising' || opkStatus === 'peak') {
                    risingPeakDays.push(dayNumber);
                  }
                }
                risingPeakDays.sort((a, b) => a - b);

                // Guard: skip if no Rising/Peak days
                if (risingPeakDays.length === 0) return null;

                const numDays = chartData.maxDay - chartData.minDay + 1;
                const cellWidth = plotAreaWidth / numDays;

                // Calculate label x-position
                let labelX: number;
                if (risingPeakDays.length === 1) {
                  // Center on single day
                  const dayIndex = risingPeakDays[0] - chartData.minDay;
                  labelX = plotAreaOffset + (dayIndex + 0.5) * cellWidth;
                } else {
                  // Center between first and last Rising/Peak day
                  const firstDayIndex = risingPeakDays[0] - chartData.minDay;
                  const lastDayIndex = risingPeakDays[risingPeakDays.length - 1] - chartData.minDay;
                  const firstX = plotAreaOffset + (firstDayIndex + 0.5) * cellWidth;
                  const lastX = plotAreaOffset + (lastDayIndex + 0.5) * cellWidth;
                  labelX = (firstX + lastX) / 2;
                }

                // Position label below the graph line, within gradient area
                const labelY = plotAreaTop + plotAreaHeight - 30;

                return (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${labelX}px`,
                      top: `${labelY}px`,
                      transform: 'translateX(-50%)',
                      zIndex: 1
                    }}
                  >
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#2e7d32',
                      fontFamily: "'Montserrat', sans-serif",
                      textShadow: '0 1px 2px rgba(255,255,255,0.8)'
                    }}>
                      Fertile Window
                    </span>
                  </div>
                );
              })()}

              {/* Thermal-shift annotations: BACKGROUND layer (band + halos) */}
              {annotationData && chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && settings && (
                <ThermalShiftBackgroundLayer
                  data={annotationData}
                  days={cycleDayInputs}
                  temperatureUnit={settings.temperatureUnit}
                  plotAreaOffset={plotAreaOffset}
                  plotAreaWidth={plotAreaWidth}
                  plotAreaTop={plotAreaTop}
                  plotAreaHeight={plotAreaHeight}
                  yAxisRange={yAxisRange}
                  minDay={chartData.minDay}
                  maxDay={chartData.maxDay}
                />
              )}

              {/* Custom Crosshair Overlay - extends through custom grid */}
              {crosshairX !== null && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${crosshairX}px`,
                    top: 0,
                    width: '0',
                    height: '100%',
                    borderLeft: '1px dashed #b6b6b6',
                    zIndex: 5
                  }}
                />
              )}

              {/* Custom Tooltip Overlay */}
              {(() => {
                const tooltipDayNumber = pinnedDayNumber ?? hoveredDayNumber;
                const tooltipCrosshairX = pinnedDayNumber !== null ? pinnedCrosshairX : crosshairX;

                if (tooltipDayNumber === null || !chartData || plotAreaTop === 0 || tooltipCrosshairX === null) return null;

                const day = allCycleDaysMap.get(tooltipDayNumber);
                if (!day) return null;
                const bbtDay = chartData.allDaysMap.get(tooltipDayNumber);
                const temp = bbtDay?.bbt != null
                  ? toDisplayTemperature(bbtDay.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT').toFixed(2)
                  : null;
                const tempUnit = settings?.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
                // Position tooltip at cell-centre so it stays stable while the cursor
                // travels toward the Edit button (no live-cursor chase effect).
                const TOOLTIP_WIDTH = 180;
                const TOOLTIP_OFFSET_X = 16;
                const TOOLTIP_OFFSET_Y = -15;
                const TOOLTIP_HEIGHT_ESTIMATE = 200;
                // SHIELD extends the outer wrapper toward the cursor so that cells
                // underneath don't fire mouseenter while the user is in transit.
                const SHIELD = 56;
                const containerWidth = chartContainerRef.current?.offsetWidth ?? Infinity;
                const containerHeight = chartContainerRef.current?.offsetHeight ?? Infinity;

                // Use cell-centre crosshair (stable per day) instead of live cursor X.
                const baseX = tooltipCrosshairX;
                const rawLeft = baseX + TOOLTIP_OFFSET_X;
                const isFlipped = rawLeft + TOOLTIP_WIDTH > containerWidth;
                const tooltipLeft = isFlipped
                  ? Math.max(0, baseX - TOOLTIP_WIDTH - 4)
                  : rawLeft;

                const baseY = cursorYRef.current ?? plotAreaTop + 8;
                const tooltipTop = Math.max(0, Math.min(baseY + TOOLTIP_OFFSET_Y, containerHeight - TOOLTIP_HEIGHT_ESTIMATE));

                return (
                  <div
                    className="absolute pointer-events-none md:pointer-events-auto"
                    style={{
                      left:   `${isFlipped ? tooltipLeft : tooltipLeft - SHIELD}px`,
                      top:    `${tooltipTop - 10}px`,
                      paddingTop:   '10px',
                      paddingLeft:  isFlipped ? 0 : SHIELD,
                      paddingRight: isFlipped ? SHIELD : 0,
                      zIndex: 10,
                    }}
                  >
                    <div
                      className="p-3 bg-white border rounded shadow-lg text-sm min-w-[140px] md:pointer-events-auto"
                    >
                      <div className="font-bold mb-1">{formatDateDDMMMYYYY(new Date(day.date))}</div>
                      <div className="text-xs text-gray-500">{getDayOfWeek(new Date(day.date))}</div>
                      <div className="text-xs text-gray-500 mb-2">Cycle Day {tooltipDayNumber}</div>
                      {temp && <div className="font-semibold">{temp}{tempUnit}</div>}
                      {bbtDay?.bbtTime && <div className="text-xs">Time: {bbtDay.bbtTime}</div>}
                      {day.hadIntercourse && <div className="text-xs text-pink-600">Intercourse</div>}
                      {day.excludeFromInterpretation && (
                        <div className="text-xs text-gray-500">Excluded from interpretation</div>
                      )}
                      {day.disturbanceFactors?.length > 0 && (
                        <div className="text-sm mt-1 flex flex-wrap gap-x-1">
                          {day.disturbanceFactors.map((f: string) => {
                            if (f === 'TRAVEL') {
                              const diff = day.travelTimeDiff ?? null;
                              const prefix = diff !== null && diff !== 0
                                ? (diff > 0 ? `+${diff}h` : `${diff}h`)
                                : null;
                              const flipped = diff !== null && diff < 0;
                              return (
                                <span key={f} className="inline-flex items-center gap-0.5">
                                  {prefix && <span>{prefix}</span>}
                                  <span style={flipped ? { display: 'inline-block', transform: 'scaleX(-1)' } : undefined}>✈️</span>
                                </span>
                              );
                            }
                            const emoji = DISTURBANCE_EMOJI[f];
                            return emoji ? <span key={f}>{emoji}</span> : null;
                          })}
                        </div>
                      )}
                      {day.id && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex pointer-events-auto">
                          <Link to={`/cycles/${cycleId}/add-day?dayId=${day.id}&returnTo=chart`}>
                            <Button size="sm" variant="ghost" className="hidden md:inline-flex">Edit</Button>
                            <Button size="sm" variant="outline" aria-label="Edit" className="md:hidden">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              {/* Gray-tail background overlay for the BBT plot region.
                  Sits BEHIND the Apex SVG (z-index: 0). Because we set
                  chart.background = 'transparent' above, the chart-area pixels are
                  transparent, so this div's #fafafa fill shows through in the tail
                  region. Apex's gridlines render inside the SVG above z-index 0, so
                  they remain visible on top of the tail fill. */}
              {cycle && !cycle.isActive && recordedMaxDay < displayDayRange.maxDay && plotAreaWidth > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: `${plotAreaTop}px`,
                    height: `${plotAreaHeight}px`,
                    left: `${plotAreaOffset + (recordedMaxDay / (displayDayRange.maxDay - displayDayRange.minDay + 1)) * plotAreaWidth}px`,
                    width: `${plotAreaWidth - (recordedMaxDay / (displayDayRange.maxDay - displayDayRange.minDay + 1)) * plotAreaWidth}px`,
                    background: '#fafafa',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Custom Sensiplan coverline overlay. For ended short cycles with a
                  gray tail, the line is clipped to the recorded x-extent and the
                  label sits INSIDE the recorded portion. For all other cycles
                  (active, or long ended with no tail), the line spans the full plot
                  width and the label sits at the right edge — preserving today's
                  visual appearance. Replaces the Apex annotations.yaxis line that
                  used to span the full plot width. */}
              {coverlineOverlay && plotAreaWidth > 0 && yAxisRange && cycle && (() => {
                const numDays = displayDayRange.maxDay - displayDayRange.minDay + 1;

                // Does this cycle have a gray tail? Only then do we clip.
                const hasTail = !cycle.isActive && recordedMaxDay < displayDayRange.maxDay;

                const lineX1 = plotAreaOffset;
                const lineX2 = hasTail
                  ? plotAreaOffset + (recordedMaxDay / numDays) * plotAreaWidth
                  : plotAreaOffset + plotAreaWidth; // active or long-ended: full width, today's behavior

                // Map yValue to a pixel y-coordinate. yAxisRange is { min, max }; the
                // plot's y-axis is inverted (min at the bottom, max at the top).
                const yFrac =
                  (yAxisRange.max - coverlineOverlay.yValue) /
                  (yAxisRange.max - yAxisRange.min);
                const lineY = plotAreaTop + yFrac * plotAreaHeight;

                // Label position: always just past the line's right end with
                // text-anchor='start'. For tail cycles, this puts the label into
                // the gray-tail region next to the line — that's intentional. The
                // earlier "anchor inside the recorded region" rule jammed the
                // label against BBT data points; visually the label reads better
                // sitting in the empty gray area adjacent to the line.
                const labelX = lineX2 + 4;
                const labelAnchor = 'start' as const;

                return (
                  <svg
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  >
                    <line
                      x1={lineX1}
                      x2={lineX2}
                      y1={lineY}
                      y2={lineY}
                      stroke={coverlineOverlay.color}
                      strokeOpacity={coverlineOverlay.opacity}
                      strokeWidth={1.5}
                      strokeDasharray={coverlineOverlay.dash > 0 ? `${coverlineOverlay.dash}` : undefined}
                    />
                    <text
                      x={labelX}
                      y={lineY - 4}
                      textAnchor={labelAnchor}
                      fill={coverlineOverlay.color}
                      fontSize="10"
                      fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                    >
                      {coverlineOverlay.labelText}
                    </text>
                  </svg>
                );
              })()}

              {/* ApexChart */}
              <ReactApexChart
                options={chartOptions}
                series={chartData.series}
                type="line"
                height={400}
              />

              {/* Thermal-shift annotations: FOREGROUND layer (chevrons) */}
              {annotationData && chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && settings && (
                <ThermalShiftForegroundLayer
                  data={annotationData}
                  days={cycleDayInputs}
                  temperatureUnit={settings.temperatureUnit}
                  plotAreaOffset={plotAreaOffset}
                  plotAreaWidth={plotAreaWidth}
                  plotAreaTop={plotAreaTop}
                  plotAreaHeight={plotAreaHeight}
                  yAxisRange={yAxisRange}
                  minDay={chartData.minDay}
                  maxDay={chartData.maxDay}
                />
              )}

              {/* Flower Markers for Peak LH Days - positioned above chart */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && (
                <>
                  {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                    const dayNumber = chartData.minDay + i;
                    const opkStatus = opkStatusMap.get(dayNumber);
                    
                    // Only render flower for Peak LH days
                    if (opkStatus !== 'peak') return null;

                    // Calculate x position (same formula as custom rows)
                    const numDays = chartData.maxDay - chartData.minDay + 1;
                    const cellWidth = plotAreaWidth / numDays;
                    const xPos = plotAreaOffset + ((dayNumber - chartData.minDay) + 0.5) * cellWidth;

                    // Calculate y position
                    let yPos: number;
                    const day = chartData.allDaysMap.get(dayNumber);
                    
                    if (day && day.bbt !== null) {
                      // Peak day WITH BBT: place at temperature point
                      const temp = toDisplayTemperature(day.bbt, settings?.temperatureUnit ?? 'FAHRENHEIT');
                      yPos = plotAreaTop + ((yAxisRange.max - temp) / (yAxisRange.max - yAxisRange.min)) * plotAreaHeight;
                    } else {
                      // Peak day WITHOUT BBT: center vertically in plot area
                      yPos = plotAreaTop + plotAreaHeight / 2;
                    }

                    return (
                      <div
                        key={`flower-${dayNumber}`}
                        className="absolute pointer-events-none"
                        style={{
                          left: `${xPos}px`,
                          top: `${yPos}px`,
                          transform: 'translate(-50%, -50%)', // Center the flower on the point
                          zIndex: 3
                        }}
                      >
                        {/* Flower SVG: carpel center with petals */}
                        <svg width="24" height="24" viewBox="0 0 24 24">
                          {/* Petals */}
                          <ellipse cx="12" cy="6" rx="3" ry="5" fill="#FFB6C1" opacity="0.8" />
                          <ellipse cx="18" cy="12" rx="5" ry="3" fill="#FFB6C1" opacity="0.8" />
                          <ellipse cx="12" cy="18" rx="3" ry="5" fill="#FFB6C1" opacity="0.8" />
                          <ellipse cx="6" cy="12" rx="5" ry="3" fill="#FFB6C1" opacity="0.8" />
                          <ellipse cx="16" cy="8" rx="3.5" ry="4" fill="#FFC0CB" opacity="0.8" transform="rotate(45 16 8)" />
                          <ellipse cx="16" cy="16" rx="3.5" ry="4" fill="#FFC0CB" opacity="0.8" transform="rotate(-45 16 16)" />
                          <ellipse cx="8" cy="8" rx="3.5" ry="4" fill="#FFC0CB" opacity="0.8" transform="rotate(-45 8 8)" />
                          <ellipse cx="8" cy="16" rx="3.5" ry="4" fill="#FFC0CB" opacity="0.8" transform="rotate(45 8 16)" />
                          {/* Carpel center */}
                          <circle cx="12" cy="12" r="4" fill="#FFD700" />
                          <circle cx="12" cy="12" r="2.5" fill="#FFA500" />
                        </svg>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Missing BBT day markers — small × on the connecting line */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && plotAreaHeight > 0 && yAxisRange && (
                <>
                  {missingBBTDaysOnLine.map(({ dayNumber, interpolatedTemp }) => {
                    const numDays = chartData.maxDay - chartData.minDay + 1;
                    const cellWidth = plotAreaWidth / numDays;
                    const xPos = plotAreaOffset + ((dayNumber - chartData.minDay) + 0.5) * cellWidth;
                    const yPos = plotAreaTop + ((yAxisRange.max - interpolatedTemp) / (yAxisRange.max - yAxisRange.min)) * plotAreaHeight;

                    return (
                      <div
                        key={`missing-bbt-${dayNumber}`}
                        className="absolute pointer-events-none"
                        style={{ left: `${xPos}px`, top: `${yPos}px`, transform: 'translate(-50%, -50%)', zIndex: 4 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13">
                          <circle cx="6.5" cy="6.5" r="5.5" fill="#ffffff" stroke="#6B7280" strokeWidth="1.5" />
                          <line x1="4" y1="4" x2="9" y2="9" stroke="#FF6B6B" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="9" y1="4" x2="4" y2="9" stroke="#FF6B6B" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Time Stamp Row - positioned below the chart */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && chartHeight > 0 && (
                <>
                  {/* Row Label - positioned in y-axis area */}
                  <div
                    className="absolute left-0"
                    style={{
                      width: `${plotAreaOffset}px`,
                      top: `${plotAreaTop + chartHeight}px`, // Measured plot area top + measured chart height
                      zIndex: 2
                    }}
                  >
                    <div style={{ position: 'relative', height: '38px' }}>
                      <div className="absolute flex items-center justify-end px-3 font-montserrat"
                        style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: '#fff7d9',
                          color: '#002142', fontWeight: 600, fontSize: '11px', letterSpacing: '0.02em', textAlign: 'right' }}>
                        Time Stamp
                      </div>
                    </div>
                  </div>

                  {/* Grid cells for time stamps */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      right: 0,
                      top: `${plotAreaTop + chartHeight}px`, // Measured plot area top + measured chart height
                      zIndex: 1
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const timeData = timeStampsMap.get(dayNumber);
                      const isHovered = hoveredDayNumber === dayNumber;
                      const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;

                      // Calculate cell position within plot area
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);

                      return (
                        <div key={dayNumber} className="absolute"
                          style={{ left: `${leftEdge}px`, width: `${cellWidth}px`, top: 0, height: '38px', pointerEvents: 'none' }}>
                          <div className="absolute flex flex-col items-center justify-center text-xs transition-colors"
                            style={{ inset: '1.5px', borderRadius: '3px',
                              backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#fde68a' : '#fff7d9') }}>
                            {!isTail && timeData && (
                              <>
                                <div className="font-medium leading-tight" style={{ color: '#334155' }}>{timeData.hours}</div>
                                <div className="text-xs leading-tight" style={{ color: '#334155' }}>{timeData.minutes}</div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* LH Test Row - positioned below Time Stamp */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && chartHeight > 0 && (
                <>
                  {/* Row Label - positioned in y-axis area */}
                  <div
                    className="absolute left-0"
                    style={{
                      width: `${plotAreaOffset}px`,
                      top: `${plotAreaTop + chartHeight + 38}px`, // After Time Stamp (38px)
                      zIndex: 2
                    }}
                  >
                    <div style={{ position: 'relative', height: '28px' }}>
                      <div className="absolute flex items-center justify-end px-3 font-montserrat"
                        style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: '#e8f5e9',
                          color: '#002142', fontWeight: 600, fontSize: '11px', letterSpacing: '0.02em', textAlign: 'right' }}>
                        LH Test
                      </div>
                    </div>
                  </div>

                  {/* Grid cells for LH status symbols */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      right: 0,
                      top: `${plotAreaTop + chartHeight + 38}px`, // After Time Stamp (38px)
                      zIndex: 1
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const opkStatus = opkStatusMap.get(dayNumber);
                      const isHovered = hoveredDayNumber === dayNumber;
                      const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;

                      // Calculate cell position within plot area
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);

                      // Render symbol based on status
                      let symbol: JSX.Element | null = null;
                      if (opkStatus === 'low') {
                        // bottom-aligned dash
                        symbol = (
                          <span style={{ position:'absolute', left:0, right:0, bottom:'3px', display:'flex', justifyContent:'center' }}>
                            <svg width="13" height="6" viewBox="0 0 24 6">
                              <line x1="6" y1="3" x2="18" y2="3" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          </span>
                        );
                      } else if (opkStatus === 'rising') {
                        symbol = (
                          <svg width="13" height="13" viewBox="0 0 24 24">
                            <line x1="6" y1="17" x2="17" y2="7" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                            <polyline points="11,7 17,7 17,13" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        );
                      } else if (opkStatus === 'peak') {
                        symbol = (
                          <svg width="13" height="13" viewBox="0 0 24 24">
                            <line x1="12" y1="19" x2="12" y2="6" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" />
                            <polyline points="7,11 12,6 17,11" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="3" r="2" fill="#f59e0b" />
                          </svg>
                        );
                      } else if (opkStatus === 'declining') {
                        symbol = (
                          <svg width="13" height="13" viewBox="0 0 24 24">
                            <line x1="6" y1="7" x2="17" y2="17" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                            <polyline points="17,11 17,17 11,17" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        );
                      }

                      return (
                        <div key={dayNumber} className="absolute"
                          style={{ left: `${leftEdge}px`, width: `${cellWidth}px`, top: 0, height: '28px', pointerEvents: 'none' }}>
                          <div className="absolute flex items-center justify-center text-xs transition-colors"
                            style={{ inset: '1.5px', borderRadius: '3px',
                              backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#c8e6c9' : '#e8f5e9') }}>
                            {!isTail && symbol}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Intimacy Row - positioned below LH Test */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && chartHeight > 0 && (
                <>
                  {/* Row Label - positioned in y-axis area */}
                  <div
                    className="absolute left-0"
                    style={{
                      width: `${plotAreaOffset}px`,
                      top: `${plotAreaTop + chartHeight + 66}px`, // After Time Stamp (38px) + LH Test (28px)
                      zIndex: 2
                    }}
                  >
                    <div style={{ position: 'relative', height: '28px' }}>
                      <div className="absolute flex items-center justify-end px-3 font-montserrat"
                        style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: '#fdedf6',
                          color: '#002142', fontWeight: 600, fontSize: '11px', letterSpacing: '0.02em', textAlign: 'right' }}>
                        Intimacy
                      </div>
                    </div>
                  </div>

                  {/* Grid cells for intimacy hearts */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      right: 0,
                      top: `${plotAreaTop + chartHeight + 66}px`, // After Time Stamp (38px) + LH Test (28px)
                      zIndex: 1
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const dayData = allCycleDaysMap.get(dayNumber);
                      const hasIntercourse = dayData?.hadIntercourse;
                      const isHovered = hoveredDayNumber === dayNumber;
                      const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;

                      // Calculate cell position within plot area
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);

                      return (
                        <div key={dayNumber} className="absolute"
                          style={{ left: `${leftEdge}px`, width: `${cellWidth}px`, top: 0, height: '28px', pointerEvents: 'none' }}>
                          <div className="absolute flex items-center justify-center text-xs transition-colors"
                            style={{ inset: '1.5px', borderRadius: '3px',
                              backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#fbcfe8' : '#fdedf6') }}>
                            {!isTail && hasIntercourse && (
                              <span style={{ color: '#ec4899', fontSize: '18px', lineHeight: 1 }}>❤</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Cervical Fluid & Menstrual Flow Rows - positioned below Intimacy */}
              {chartData && plotAreaWidth > 0 && plotAreaTop > 0 && chartHeight > 0 && (
                <>
                  {/* Row Labels - positioned in y-axis area */}
                  <div 
                    className="absolute left-0" 
                    style={{ 
                      width: `${plotAreaOffset}px`, 
                      top: `${plotAreaTop + chartHeight + 94}px`, // After Time Stamp (38px) + LH Test (28px) + Intimacy (28px)
                      zIndex: 2 
                    }}
                  >
                    {[
                      { name: 'Eggwhite', tooltip: 'Clear, slippery, stretchy mucus. Peak fertility.' },
                      { name: 'Watery', tooltip: 'Clear, flowing, high-fertility mucus' },
                      { name: 'Creamy', tooltip: 'Lotion-like mucus, moderate fertility' },
                      { name: 'Sticky', tooltip: 'Sticky, paste-like mucus, low fertility' },
                      { name: 'Dry', tooltip: 'No visible mucus AND dry sensation' }
                    ].map((row, idx) => (
                      <div
                        key={row.name}
                        className="cf-tooltip-trigger"
                        style={{ position: 'relative', height: '28px' }}
                      >
                        <div className="absolute flex items-center justify-end px-3 font-montserrat"
                          style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: '#e5f0ff',
                            color: '#002142', fontWeight: 600, fontSize: '11px', letterSpacing: '0.02em', textAlign: 'right' }}>
                          <span>{row.name}</span>
                          <span className="ml-1 text-slate-400 cursor-help">ⓘ</span>
                          <span className="cf-tooltip-content">{row.tooltip}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Grid cells for CF/Menstrual rows */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      right: 0,
                      top: `${plotAreaTop + chartHeight + 94}px`, // After Time Stamp (38px) + LH Test (28px) + Intimacy (28px)
                      height: '140px',
                      zIndex: 1
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const cfData = cervicalMenstrualMap.get(dayNumber);
                      const isHovered = hoveredDayNumber === dayNumber;
                      const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;

                      // Calculate cell position within plot area
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);

                      return (
                        <div
                          key={dayNumber}
                          className="absolute"
                          style={{
                            left: `${leftEdge}px`,
                            width: `${cellWidth}px`,
                            top: 0,
                            height: '140px',
                            pointerEvents: 'none'
                          }}
                        >
                          {/* 5 background cells - solid fill with rounded corners and white space gaps */}
                          {[0, 1, 2, 3, 4].map((rowIdx) => (
                            <div
                              key={rowIdx}
                              className="absolute transition-colors"
                              style={{
                                top: `${rowIdx * 28 + 1.5}px`,
                                left: '1.5px',
                                width: 'calc(100% - 3px)',
                                height: '25px',
                                backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#bfdbfe' : '#e5f0ff'),
                                borderRadius: '3px',
                              }}
                            />
                          ))}

                          {/* Cervical Fluid Bar - only if CF present and no menstrual flow */}
                          {!isTail && cfData?.cervicalAppearance && !cfData?.menstrualFlow && (
                            <div
                              className="absolute left-1/2 -translate-x-1/2 rounded"
                              style={{
                                bottom: 0,
                                width: '70%',
                                height: `${getCFBarHeight(cfData.cervicalAppearance)}px`,
                                backgroundColor: getCFBarColor(cfData.cervicalAppearance)
                              }}
                            />
                          )}

                          {/* Menstrual Flow Indicators - on Dry row only */}
                          {!isTail && cfData?.menstrualFlow && (
                            <div
                              className="absolute left-1/2 -translate-x-1/2 flex items-end justify-center"
                              style={{
                                bottom: 0,
                                width: '100%',
                                height: '28px'
                              }}
                            >
                              {cfData.menstrualFlow === 'SPOTTING' && (
                                <svg 
                                  width="20" 
                                  height="20" 
                                  viewBox="0 0 32 32" 
                                  fill="none" 
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="mb-1"
                                >
                                  <path d="M8 4C8 4 3 10.5 3 14C3 16.7614 5.23858 19 8 19C10.7614 19 13 16.7614 13 14C13 10.5 8 4 8 4Z" fill="#E53935"/>
                                  <path d="M6 14C6 13 6.5 11.5 7.5 10.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>

                                  <path d="M24 4C24 4 19 10.5 19 14C19 16.7614 21.2386 19 24 19C26.7614 19 29 16.7614 29 14C29 10.5 24 4 24 4Z" fill="#E53935"/>
                                  <path d="M22 14C22 13 22.5 11.5 23.5 10.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>

                                  <path d="M16 13C16 13 11 19.5 11 23C11 25.7614 13.2386 28 16 28C18.7614 28 21 25.7614 21 23C21 19.5 16 13 16 13Z" fill="#E53935"/>
                                  <path d="M14 23C14 22 14.5 20.5 15.5 19.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
                                </svg>
                              )}
                              {cfData.menstrualFlow === 'LIGHT' && (
                                <div
                                  className="rounded"
                                  style={{
                                    width: '70%',
                                    height: '12px',
                                    backgroundColor: '#d65866'
                                  }}
                                />
                              )}
                              {cfData.menstrualFlow === 'MEDIUM' && (
                                <div
                                  className="rounded"
                                  style={{
                                    width: '70%',
                                    height: '18px',
                                    backgroundColor: '#d65866'
                                  }}
                                />
                              )}
                              {cfData.menstrualFlow === 'HEAVY' && (
                                <div
                                  className="rounded"
                                  style={{
                                    width: '70%',
                                    height: '28px',
                                    backgroundColor: '#d65866'
                                  }}
                                />
                              )}
                              {cfData.menstrualFlow === 'VERY_HEAVY' && (
                                <div
                                  className="rounded"
                                  style={{
                                    width: '70%',
                                    height: '28px',
                                    backgroundColor: '#c82739'
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Disturbance Row Label - positioned below Dry (+234px) */}
                  <div
                    className="absolute left-0"
                    style={{
                      width: `${plotAreaOffset}px`,
                      top: `${plotAreaTop + chartHeight + 234}px`,
                      zIndex: 2
                    }}
                  >
                    <div style={{ position: 'relative', height: '28px' }}>
                      <div className="absolute flex items-center justify-end px-3 font-montserrat"
                        style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: '#f1eeff',
                          color: '#002142', fontWeight: 600, fontSize: '11px', letterSpacing: '0.02em', textAlign: 'right' }}>
                        Disturbance
                      </div>
                    </div>
                  </div>

                  {/* Notes Row Label - positioned below Disturbance (+262px) */}
                  <div
                    className="absolute left-0"
                    style={{
                      width: `${plotAreaOffset}px`,
                      top: `${plotAreaTop + chartHeight + 262}px`,
                      zIndex: 2
                    }}
                  >
                    {/* Label height is fixed at 28px; only the grid row below expands when notesRowExpanded. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => { void toggleNotesRow(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void toggleNotesRow();
                        }
                      }}
                      style={{ position: 'relative', height: '28px', cursor: 'pointer', pointerEvents: 'auto' }}
                    >
                      <div className="absolute flex items-center justify-end px-3 font-montserrat"
                        style={{ inset: '1.5px', borderRadius: '3px', backgroundColor: '#f8f8f7',
                          color: '#002142', fontWeight: 600, fontSize: '11px', letterSpacing: '0.02em', textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            transform: notesRowExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 120ms ease',
                            marginRight: '4px',
                            color: '#64748b',
                            fontSize: '10px'
                          }}
                        >
                          ▶
                        </span>
                        <span>Notes</span>
                        <span className="ml-1 text-slate-400 cursor-help" title="Free-text notes for this day (max 150 characters). Click row label to expand.">ⓘ</span>
                      </div>
                    </div>
                  </div>

                  {/* Disturbance Grid Row */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      right: 0,
                      top: `${plotAreaTop + chartHeight + 234}px`,
                      height: '28px',
                      zIndex: 1
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const distData = disturbanceMap.get(dayNumber);
                      const factors = distData?.factors ?? [];
                      const travelTimeDiff = distData?.travelTimeDiff ?? null;

                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);
                      const isHovered = hoveredDayNumber === dayNumber;
                      const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;

                      let cellContent: React.ReactNode = null;
                      if (factors.length === 1) {
                        const factor = factors[0];
                        if (factor === 'TRAVEL') {
                          const flipped = travelTimeDiff !== null && travelTimeDiff < 0;
                          cellContent = (
                            <span style={flipped ? { display: 'inline-block', transform: 'scaleX(-1)' } : undefined}>✈️</span>
                          );
                        } else {
                          cellContent = <span>{DISTURBANCE_EMOJI[factor] ?? ''}</span>;
                        }
                      } else if (factors.length > 1) {
                        cellContent = <span>{factors.length}⚠️</span>;
                      }

                      return (
                        <div key={dayNumber} className="absolute"
                          style={{ left: `${leftEdge}px`, width: `${cellWidth}px`, top: 0, height: '28px', pointerEvents: 'none' }}>
                          <div className="absolute flex items-center justify-center text-sm transition-colors"
                            style={{ inset: '1.5px', borderRadius: '3px',
                              backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#ddd6fe' : '#f1eeff') }}>
                            {!isTail && <span className="relative z-10">{cellContent}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Notes Grid Row - positioned below Disturbance (+262px) */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      right: 0,
                      top: `${plotAreaTop + chartHeight + 262}px`,
                      height: `${NOTES_ROW_HEIGHT}px`,
                      zIndex: 1
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const dayData = allCycleDaysMap.get(dayNumber);
                      const note: string | null = dayData?.notes ?? null;
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);
                      const isTail = cycle ? isCycleDayInTail(cycle, dayNumber, recordedMaxDay) : false;
                      const isHovered = hoveredDayNumber === dayNumber;

                      return (
                        <div
                          key={dayNumber}
                          role="button"
                          aria-disabled={isTail || undefined}
                          tabIndex={isTail ? -1 : 0}
                          onClick={isTail ? undefined : () => setEditorOpenForDay(dayNumber)}
                          onKeyDown={(e) => {
                            if (isTail) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setEditorOpenForDay(dayNumber);
                            }
                          }}
                          className="absolute flex items-center justify-center"
                          style={{
                            left: `${leftEdge}px`,
                            width: `${cellWidth}px`,
                            top: 0,
                            height: `${NOTES_ROW_HEIGHT}px`,
                            cursor: isTail ? 'default' : 'pointer',
                            pointerEvents: 'auto'
                          }}
                        >
                          <div
                            className="absolute"
                            style={{
                              inset: '1.5px',
                              borderRadius: '3px',
                              backgroundColor: isTail ? '#f1f5f9' : (isHovered ? '#e7e5e4' : '#f8f8f7')
                            }}
                          />
                          {!isTail && note !== null && note !== '' && (
                            notesRowExpanded ? (
                              <div
                                className="absolute"
                                style={{
                                  top: 4,
                                  bottom: 4,
                                  left: 0,
                                  right: 0,
                                  writingMode: 'vertical-rl',
                                  transform: 'rotate(180deg)',
                                  fontSize: '9.5px',
                                  lineHeight: 1.15,
                                  color: '#78350f',
                                  padding: '4px 2px',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  zIndex: 1,
                                  pointerEvents: 'none'
                                }}
                              >
                                {note}
                              </div>
                            ) : (
                              <span
                                className="relative z-10"
                                style={{ color: '#78350f', fontSize: '12px', lineHeight: 1, pointerEvents: 'none' }}
                              >
                                ✎
                              </span>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-4">No temperature data recorded yet.</p>
              <Link to={`/cycles/${cycle.id}/add-day`}>
                <Button>Add Your First Entry</Button>
              </Link>
            </div>
          )}
            {/* Interpretation Proposition Card */}
            <div className="px-4 pb-4">
              {(cycle as any).markedAnovulatoryAt ? (
                <AnovulatoryCard onRemoveMark={interpretationActions.unmarkClassification} />
              ) : (cycle as any).markedUninterpretableAt ? (
                <UninterpretableCard onRemoveMark={interpretationActions.unmarkClassification} />
              ) : engineResult ? (
                <PropositionCard
                  engineResult={engineResult}
                  interpretation={interpretation}
                  postShiftMonitoring={postShiftMonitoring}
                  changeNotice={null}
                  keepWatchingDismissed={keepWatchingDismissed}
                  onKeepWatching={onKeepWatching}
                  actions={interpretationActions}
                  cycleIsActive={cycle.isActive}
                  maxDayNumber={maxDayNumber}
                  onReEvaluate={interpretationActions.reEvaluate}
                  onMarkAnovulatory={interpretationActions.markAnovulatory}
                  onMarkUninterpretable={interpretationActions.markUninterpretable}
                  days={cycleDayInputs}
                  cycleStartDate={new Date(cycle.startDate)}
                />
              ) : null}
            </div>
        </CardContent>
      </Card>

      {editorOpenForDay !== null && cycle && chartData && (() => {
        const dayNumber = editorOpenForDay;
        const day = allCycleDaysMap.get(dayNumber);
        const cycleStart = new Date(cycle.startDate);
        // resolveCycleDayIsoDate handles both branches:
        //   - existing day → preserve stored UTC date (avoid shifting to a
        //     different calendar day in TZ west of UTC)
        //   - padded day → local-calendar arithmetic + local-calendar
        //     formatting (avoid DST drift via toISOString)
        const isoDate = resolveCycleDayIsoDate(cycleStart, dayNumber, day?.date);
        const dayDate = day?.date
          ? new Date(day.date)
          : (() => {
              const d = new Date(cycleStart);
              d.setDate(cycleStart.getDate() + (dayNumber - 1));
              return d;
            })();
        const shortDate = dayDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

        return (
          <NoteEditorSheet
            open
            onOpenChange={(o) => !o && setEditorOpenForDay(null)}
            cycleId={cycle.id}
            dayNumber={dayNumber}
            date={isoDate}
            shortDate={shortDate}
            existingNote={day?.notes ?? null}
            saveNote={async ({ cycleId, dayNumber, date, notes }) => {
              const { createOrUpdateCycleDay } = await import('wasp/client/operations');
              await createOrUpdateCycleDay({ cycleId, dayNumber, date, notes });
            }}
          />
        );
      })()}

      {/* Cycle Navigation */}
      <div className="flex justify-between items-center">
        {prevCycle ? (
          <Link to={`/cycles/${prevCycle.id}/chart`}>
            <Button variant="outline">
              <span className="sm:hidden">← #{prevCycle.cycleNumber}</span>
              <span className="hidden sm:inline">← Previous Cycle (#{prevCycle.cycleNumber})</span>
            </Button>
          </Link>
        ) : (
          <div></div>
        )}
        {nextCycle ? (
          <Link to={`/cycles/${nextCycle.id}/chart`}>
            <Button variant="outline">
              <span className="sm:hidden">#{nextCycle.cycleNumber} →</span>
              <span className="hidden sm:inline">Next Cycle (#{nextCycle.cycleNumber}) →</span>
            </Button>
          </Link>
        ) : (
          <div></div>
        )}
      </div>
      </div>
    </div>
  );
}

