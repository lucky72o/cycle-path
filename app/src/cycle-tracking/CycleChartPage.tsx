import { useMemo, useRef, useEffect, useState, Fragment } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleById, getUserSettings, getUserCycles } from 'wasp/client/operations';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import ReactApexChart from 'react-apexcharts';
import { fahrenheitToCelsius, formatDate, formatDateLong, getDayOfWeekAbbreviation, getDayOfWeek } from './utils';
import type { ApexOptions } from 'apexcharts';
import SideNav from './SideNav';

export default function CycleChartPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  
  const { data: allCycles } = useQuery(getUserCycles);
  const { data: cycle, isLoading: cycleLoading } = useQuery(getCycleById, { cycleId: cycleId || '' }, { enabled: !!cycleId });
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);

  // Refs and state for custom x-axis rows
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredDayNumber, setHoveredDayNumber] = useState<number | null>(null);
  const [plotAreaOffset, setPlotAreaOffset] = useState<number>(0);
  const [plotAreaWidth, setPlotAreaWidth] = useState<number>(0);
  const [plotAreaTop, setPlotAreaTop] = useState<number>(0);
  const [chartHeight, setChartHeight] = useState<number>(0);
  const [crosshairX, setCrosshairX] = useState<number | null>(null);

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

  // Determine how many days to show on the chart.
  const displayDayRange = useMemo(() => {
    if (!cycle) {
      return { minDay: 1, maxDay: 28 };
    }

    const DEFAULT_DAYS = 28;
    const recordedMaxDay =
      cycle.days.length > 0
        ? Math.max(...cycle.days.map((day: any) => day.dayNumber))
        : 1;

    // If the cycle is still active, always show at least the default length.
    // If it has ended, shrink to the actual recorded length (unless it exceeds the default).
    const maxDay = cycle.endDate
      ? Math.max(recordedMaxDay, 1) // ended: show actual (may be below default)
      : Math.max(DEFAULT_DAYS, recordedMaxDay); // active: pad to default, but still expands if recorded > default

    return { minDay: 1, maxDay };
  }, [cycle]);

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
        const temp = tempUnit === 'CELSIUS' 
          ? fahrenheitToCelsius(day.bbt!)
          : day.bbt!;
        const tempValue = Number(temp.toFixed(2));
        
        allPoints.push({ 
          x: dayNumber, 
          y: tempValue,
          isExcluded: day.excludeFromInterpretation,
          dayNumber
        });
      }
    }

    // Build series: separate solid and dashed segments
    const solidSegments: Array<{x: number, y: number}>[] = [];
    const dashedSegments: Array<{x: number, y: number}>[] = [];
    
    let currentSolidSegment: Array<{x: number, y: number}> = [];
    
    for (let i = 0; i < allPoints.length; i++) {
      const point = allPoints[i];
      const prevPoint = i > 0 ? allPoints[i - 1] : null;
      const nextPoint = i < allPoints.length - 1 ? allPoints[i + 1] : null;
      
      if (point.isExcluded) {
        // Close current solid segment if it exists
        if (currentSolidSegment.length > 0) {
          solidSegments.push([...currentSolidSegment]);
          currentSolidSegment = [];
        }
        
        // Create dashed segment from previous to this excluded point
        if (prevPoint) {
          dashedSegments.push([
            { x: prevPoint.x, y: prevPoint.y },
            { x: point.x, y: point.y }
          ]);
        }
        
        // Create dashed segment from this excluded point to next
        if (nextPoint) {
          dashedSegments.push([
            { x: point.x, y: point.y },
            { x: nextPoint.x, y: nextPoint.y }
          ]);
        }
      } else {
        // Add to current solid segment
        currentSolidSegment.push({ x: point.x, y: point.y });
        
        // If next point is excluded or this is the last point, close the segment
        if (!nextPoint || nextPoint.isExcluded) {
          if (currentSolidSegment.length > 0) {
            solidSegments.push([...currentSolidSegment]);
            currentSolidSegment = [];
          }
        }
      }
    }

    // Build series array: solid segments + dashed segments
    const series = [
      ...solidSegments.map((segment, index) => ({
        name: `BBT-${index}`,
        data: segment
      })),
      ...dashedSegments.map((segment, index) => ({
        name: `Dashed-${index}`,
        data: segment
      }))
    ];

    return {
      series,
      minDay: displayDayRange.minDay,
      maxDay: displayDayRange.maxDay,
      numSolidSegments: solidSegments.length,
      numDashedSegments: dashedSegments.length,
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
      const abbreviation = getDayOfWeekAbbreviation(getDayOfWeek(date));
      map.set(dayNumber, abbreviation);
    }

    return map;
  }, [cycle, displayDayRange]);

  // Calculate dynamic Y-axis range based on actual data (including excluded points)
  const yAxisRange = useMemo(() => {
    if (!chartData || !settings) return null;

    // Collect all temperature values from both series ({x, y} format)
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
    const max = Math.max(defaultRange.max, actualMax);

    return { min, max };
  }, [chartData, settings]);

  // Build labels for dates and weekdays for the full displayed range using the cycle start date.
  const datesMap = useMemo(() => {
    if (!cycle) return new Map<number, string>();
    
    const map = new Map<number, string>();
    let previousMonth: number | null = null;
    const startDate = new Date(cycle.startDate);

    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (dayNumber - 1));
      const dayOfMonth = date.getDate();
      const month = date.getMonth() + 1;

      if (dayNumber === displayDayRange.minDay || (previousMonth !== null && month !== previousMonth)) {
        map.set(dayNumber, `${dayOfMonth}/${month}`);
      } else {
        map.set(dayNumber, `${dayOfMonth}`);
      }

      previousMonth = month;
    }
    
    return map;
  }, [cycle, displayDayRange]);

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
          enabled: true
        },
        animations: {
          enabled: true,
          dynamicAnimation: {
            enabled: true
          }
        },
        foreColor: '#002142', // Set default text color for axis labels
        events: {
          dataPointMouseEnter: function(_event: any, _chartContext: any, config: any) {
            const seriesIndex = config.seriesIndex;
            const dataPointIndex = config.dataPointIndex;
            
            if (seriesIndex >= 0 && dataPointIndex >= 0 && chartData && plotAreaWidth > 0) {
              // Get the data point from the series
              const point = chartData.series[seriesIndex]?.data[dataPointIndex];
              if (point) {
                const dayNumber = point.x;
                setHoveredDayNumber(dayNumber);
                
                // Calculate crosshair position
                const numDays = chartData.maxDay - chartData.minDay + 1;
                const cellWidth = plotAreaWidth / numDays;
                const dayIndex = dayNumber - chartData.minDay;
                const xPos = plotAreaOffset + (dayIndex + 0.5) * cellWidth;
                setCrosshairX(xPos);
              }
            }
          },
          dataPointMouseLeave: function() {
            setHoveredDayNumber(null);
            setCrosshairX(null);
          }
        }
      },
      theme: {
        mode: 'light',
        palette: 'palette1',
        monochrome: {
          enabled: false
        }
      },
      legend: {
        show: false // Hide legend since we have multiple internal series (BBT-0, BBT-1, Dashed-0, etc.)
      },
      grid: {
        padding: {
          left: 50, // Increased to create more space between title and labels
          right: 40 // Extra padding to ensure last data point is fully visible with room
        },
        show: true,
        clipMarkers: false, // Don't clip markers at the edge
        xaxis: {
          lines: {
            show: false // Hide vertical grid lines - we use custom table borders instead
          }
        }
      },
      colors: [
        ...Array(chartData.numSolidSegments).fill('#3b82f6'), // Blue for solid segments
        ...Array(chartData.numDashedSegments).fill('#9CA3AF')  // Grey for dashed segments
      ],
      stroke: {
        curve: 'straight',
        width: [
          ...Array(chartData.numSolidSegments).fill(2),       // Width 2 for solid
          ...Array(chartData.numDashedSegments).fill(2)        // Width 2 for dashed
        ],
        dashArray: [
          ...Array(chartData.numSolidSegments).fill(0),        // Solid lines
          ...Array(chartData.numDashedSegments).fill(5)        // Dashed lines
        ]
      },
      fill: {
        opacity: 1
      },
      dataLabels: {
        enabled: false
      },
      markers: {
        size: [
          ...Array(chartData.numSolidSegments).fill(5),  // Show markers on solid segments
          ...Array(chartData.numDashedSegments).fill(0)   // Hide markers on dashed segments (we'll use discrete markers)
        ],
        fillOpacity: 1,
        strokeWidth: 2,
        strokeColors: '#fff',
        hover: {
          size: 7,
          sizeOffset: 0
        },
        discrete: (() => {
          const discreteMarkers: any[] = [];
          
          // Helper to find all occurrences of a day number in series (it may appear in multiple)
          const findPointInSolidSeries = (dayNumber: number) => {
            // Only look in solid segments (first numSolidSegments series)
            for (let seriesIndex = 0; seriesIndex < chartData.numSolidSegments; seriesIndex++) {
              const series = chartData.series[seriesIndex];
              for (let dataPointIndex = 0; dataPointIndex < series.data.length; dataPointIndex++) {
                const point = series.data[dataPointIndex];
                if (point.x === dayNumber) {
                  return { seriesIndex, dataPointIndex };
                }
              }
            }
            return null;
          };
          
          // Helper to find point in dashed segments
          const findPointInDashedSeries = (dayNumber: number) => {
            const results: Array<{seriesIndex: number, dataPointIndex: number}> = [];
            // Look in dashed segments (after solid segments)
            for (let i = 0; i < chartData.numDashedSegments; i++) {
              const seriesIndex = chartData.numSolidSegments + i;
              const series = chartData.series[seriesIndex];
              for (let dataPointIndex = 0; dataPointIndex < series.data.length; dataPointIndex++) {
                const point = series.data[dataPointIndex];
                if (point.x === dayNumber) {
                  results.push({ seriesIndex, dataPointIndex });
                }
              }
            }
            return results;
          };
          
          // Add discrete markers for excluded points (grey) in dashed segments
          allDaysWithBBT
            .filter((day: any) => day.excludeFromInterpretation)
            .forEach((day: any) => {
              const dashedLocations = findPointInDashedSeries(day.dayNumber);
              dashedLocations.forEach(location => {
                discreteMarkers.push({
                  seriesIndex: location.seriesIndex,
                  dataPointIndex: location.dataPointIndex,
                  fillColor: '#9CA3AF',
                  strokeColor: '#fff',
                  size: 5
                });
              });
            });
          
          // Add discrete markers for included points that appear in dashed segments (blue)
          // These are the points adjacent to excluded points
          allDaysWithBBT
            .filter((day: any) => !day.excludeFromInterpretation)
            .forEach((day: any) => {
              const dashedLocations = findPointInDashedSeries(day.dayNumber);
              dashedLocations.forEach(location => {
                discreteMarkers.push({
                  seriesIndex: location.seriesIndex,
                  dataPointIndex: location.dataPointIndex,
                  fillColor: '#3b82f6',
                  strokeColor: '#fff',
                  size: 5
                });
              });
            });
          
          // Mark intercourse days with pink markers (overrides all colors)
          cycle?.days
            .filter((day: any) => day.hadIntercourse && day.bbt !== null)
            .forEach((day: any) => {
              // Find in solid series
              const solidLocation = findPointInSolidSeries(day.dayNumber);
              if (solidLocation) {
                discreteMarkers.push({
                  seriesIndex: solidLocation.seriesIndex,
                  dataPointIndex: solidLocation.dataPointIndex,
                  fillColor: '#ec4899',
                  strokeColor: '#fff',
                  size: 5
                });
              }
              
              // Also find in dashed series (in case it's adjacent to an excluded point)
              const dashedLocations = findPointInDashedSeries(day.dayNumber);
              dashedLocations.forEach(location => {
                discreteMarkers.push({
                  seriesIndex: location.seriesIndex,
                  dataPointIndex: location.dataPointIndex,
                  fillColor: '#ec4899',
                  strokeColor: '#fff',
                  size: 5
                });
              });
            });
          
          return discreteMarkers;
        })()
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
        enabled: true,
        intersect: true,
        shared: false,
        followCursor: false,
        x: {
          show: false // Disable tooltip-related x-axis crosshairs
        },
        y: {
          title: {
            formatter: () => '' // Remove series name from tooltip
          }
        },
        marker: {
          show: false // Hide the marker/color indicator in tooltip
        },
        custom: function({ seriesIndex, dataPointIndex }) {
          // Get the data point from the series
          const point = chartData?.series[seriesIndex]?.data[dataPointIndex];
          if (!point) return '';
          
          // Find the corresponding day data using the day number (x value)
          const day = chartData?.allDaysMap.get(point.x);
          if (!day || !day.bbt) return '';
          
          const temp = settings.temperatureUnit === 'CELSIUS' 
            ? fahrenheitToCelsius(day.bbt).toFixed(2)
            : day.bbt.toFixed(2);
          const tempUnit = settings.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
          
          return `
            <div class="p-3 bg-white border rounded shadow-lg">
              <div class="font-bold mb-1">${formatDate(new Date(day.date))}</div>
              <div class="text-sm">${day.dayOfWeek}</div>
              <div class="font-semibold mt-2">${temp}${tempUnit}</div>
              ${day.bbtTime ? `<div class="text-sm">Time: ${day.bbtTime}</div>` : ''}
              ${day.hadIntercourse ? '<div class="text-sm text-pink-600">Intercourse</div>' : ''}
              ${day.excludeFromInterpretation ? '<div class="text-sm text-gray-500">Excluded from interpretation</div>' : ''}
            </div>
          `;
        }
      },
      crosshairs: {
        show: false // Disabled - using custom crosshair overlay instead
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
        // Find the Apex plot area (excludes y-axis labels)
        const plotArea = chartContainerRef.current.querySelector('.apexcharts-inner');
        if (plotArea) {
          const containerRect = chartContainerRef.current.getBoundingClientRect();
          const plotRect = plotArea.getBoundingClientRect();

          // Calculate offset and width relative to container
          const offset = plotRect.left - containerRect.left;
          setPlotAreaOffset(offset);
          setPlotAreaWidth(plotRect.width);

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

  if (cycleLoading || settingsLoading) {
    return (
      <div className="flex">
        <SideNav />
        <div className="flex-1 p-8">
          <div className="text-center">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="flex">
        <SideNav />
        <div className="flex-1 p-8">
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
      <div className="flex-1 p-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Cycle #{cycle.cycleNumber} Chart</h1>
          <p className="text-muted-foreground">
            Started: {formatDateLong(new Date(cycle.startDate))}
            {cycle.endDate && ` - Ended: ${formatDateLong(new Date(cycle.endDate))}`}
          </p>
        </div>
        <Link to="/cycles/new">
          <Button variant="default">Begin new cycle</Button>
        </Link>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Temperature Chart</CardTitle>
          <div className="flex items-center gap-2">
            <Link to={`/cycles/${cycle.id}/add-day`}>
              <Button variant="outline" size="sm">
                <svg className="w-4 h-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                Add a Day
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
          `}</style>
          {chartData ? (
            <div ref={chartContainerRef} className="relative" style={{ paddingTop: '108px', paddingBottom: '48px' }}>
              {/* Custom X-axis rows with labels */}
              {chartData && plotAreaWidth > 0 && (
                <>
                  {/* Row Labels - positioned in y-axis area */}
                  <div className="absolute top-0 left-0" style={{ width: `${plotAreaOffset}px`, zIndex: 2 }}>
                    <div className="flex items-center justify-end px-3 h-9 text-xs font-medium bg-blue-50 border-b border-slate-300 border-r border-slate-300">
                      Date
                    </div>
                    <div className="flex items-center justify-end px-3 h-9 text-xs font-medium bg-slate-100 border-b border-slate-300 border-r border-slate-300">
                      Week Day
                    </div>
                    <div className="flex items-center justify-end px-3 h-9 text-xs font-medium bg-white border-b border-slate-200 border-r border-slate-300">
                      Cycle Day
                    </div>
                  </div>

                  {/* Grid cells - calculated positions within plot area */}
                  <div className="absolute top-0 pointer-events-none" style={{ left: 0, right: 0, zIndex: 1 }}>
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const dateLabel = datesMap.get(dayNumber) || '';
                      const weekDay = weekDaysMap.get(dayNumber) || '';
                      const isHovered = hoveredDayNumber === dayNumber;
                      
                      // Calculate cell position within plot area
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);
                      
                      return (
                        <Fragment key={dayNumber}>
                          {/* Date Cell */}
                          <div
                            className={`absolute flex items-center justify-center text-xs border-r border-b border-slate-300 transition-colors ${
                              isHovered ? 'bg-[#bfdbfe]' : 'bg-blue-50'
                            }`}
                            style={{
                              left: `${leftEdge}px`,
                              width: `${cellWidth}px`,
                              top: 0,
                              height: '36px'
                            }}
                          >
                            {dateLabel}
                          </div>
                          
                          {/* Week Day Cell */}
                          <div
                            className={`absolute flex items-center justify-center text-xs border-r border-b border-slate-300 transition-colors ${
                              isHovered ? 'bg-[#bfdbfe]' : 'bg-slate-100'
                            }`}
                            style={{
                              left: `${leftEdge}px`,
                              width: `${cellWidth}px`,
                              top: '36px',
                              height: '36px'
                            }}
                          >
                            {weekDay}
                          </div>
                          
                          {/* Cycle Day Cell */}
                          <div
                            className={`absolute flex items-center justify-center text-xs border-r border-b border-slate-200 transition-colors ${
                              isHovered ? 'bg-[#bfdbfe]' : 'bg-white'
                            }`}
                            style={{
                              left: `${leftEdge}px`,
                              width: `${cellWidth}px`,
                              top: '72px',
                              height: '36px'
                            }}
                          >
                            {dayNumber}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </>
              )}
              
              {/* Custom Crosshair Overlay - extends through custom grid */}
              {crosshairX !== null && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${crosshairX}px`,
                    top: 0,
                    width: '0',
                    height: 'calc(100% + 48px)', // Extend by the height of the time stamp row
                    borderLeft: '1px dashed #b6b6b6',
                    zIndex: 5
                  }}
                />
              )}
              
              {/* ApexChart */}
              <ReactApexChart
                options={chartOptions}
                series={chartData.series}
                type="line"
                height={400}
              />

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
                    <div className="flex items-center justify-end px-3 h-12 text-xs font-medium bg-amber-50 border-b border-slate-300 border-r border-slate-300">
                      Time Stamp
                    </div>
                  </div>

                  {/* Grid cells for time stamps */}
                  <div
                    className="absolute pointer-events-none"
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

                      // Calculate cell position within plot area
                      const numDays = chartData.maxDay - chartData.minDay + 1;
                      const cellWidth = plotAreaWidth / numDays;
                      const leftEdge = plotAreaOffset + (i * cellWidth);

                      return (
                        <div
                          key={dayNumber}
                          className={`absolute flex flex-col items-center justify-center text-xs border-r border-b border-slate-300 transition-colors ${
                            isHovered ? 'bg-[#fde68a]' : 'bg-amber-50'
                          }`}
                          style={{
                            left: `${leftEdge}px`,
                            width: `${cellWidth}px`,
                            top: 0,
                            height: '48px'
                          }}
                        >
                          {timeData && (
                            <>
                              <div className="font-medium leading-tight">{timeData.hours}</div>
                              <div className="text-xs leading-tight">{timeData.minutes}</div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-4">No temperature data recorded yet.</p>
              <Link to={`/cycles/${cycle.id}/add-day`}>
                <Button>Add Your First Entry</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cycle Navigation */}
      <div className="flex justify-between items-center">
        {prevCycle ? (
          <Link to={`/cycles/${prevCycle.id}/chart`}>
            <Button variant="outline">← Previous Cycle (#{prevCycle.cycleNumber})</Button>
          </Link>
        ) : (
          <div></div>
        )}
        {nextCycle ? (
          <Link to={`/cycles/${nextCycle.id}/chart`}>
            <Button variant="outline">Next Cycle (#{nextCycle.cycleNumber}) →</Button>
          </Link>
        ) : (
          <div></div>
        )}
      </div>
      </div>
    </div>
  );
}

