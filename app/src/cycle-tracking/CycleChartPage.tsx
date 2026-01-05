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
    
    // Create a map of day numbers to temperatures for quick lookup
    const includedTempMap = new Map(
      includedBBTDays.map((day: any) => {
        const temp = tempUnit === 'CELSIUS' 
          ? fahrenheitToCelsius(day.bbt!)
          : day.bbt!;
        return [day.dayNumber, Number(temp.toFixed(2))];
      })
    );
    
    const excludedTempMap = new Map(
      excludedBBTDays.map((day: any) => {
        const temp = tempUnit === 'CELSIUS' 
          ? fahrenheitToCelsius(day.bbt!)
          : day.bbt!;
        return [day.dayNumber, Number(temp.toFixed(2))];
      })
    );

    // Build arrays with x,y pairs for numeric axis with even spacing
    const includedData: Array<{x: number, y: number}> = [];
    const excludedData: Array<{x: number, y: number}> = [];
    
    for (let dayNumber = displayDayRange.minDay; dayNumber <= displayDayRange.maxDay; dayNumber++) {
      const includedTemp = includedTempMap.get(dayNumber);
      const excludedTemp = excludedTempMap.get(dayNumber);
      
      if (includedTemp !== undefined) {
        includedData.push({ x: dayNumber, y: includedTemp });
      }
      if (excludedTemp !== undefined) {
        excludedData.push({ x: dayNumber, y: excludedTemp });
      }
    }

    return {
      series: [
        {
          name: 'BBT',
          data: includedData
        },
        {
          name: 'BBT (Excluded)',
          data: excludedData
        }
      ],
      minDay: displayDayRange.minDay,
      maxDay: displayDayRange.maxDay
    };
  }, [cycle, displayDayRange, includedBBTDays, excludedBBTDays, settings]);

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
              const daysList = seriesIndex === 0 ? includedBBTDays : excludedBBTDays;
              const day = daysList[dataPointIndex];
              if (day) {
                setHoveredDayNumber(day.dayNumber);
                
                // Calculate crosshair position
                const numDays = chartData.maxDay - chartData.minDay + 1;
                const cellWidth = plotAreaWidth / numDays;
                const dayIndex = day.dayNumber - chartData.minDay;
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
      colors: ['#3b82f6', '#9CA3AF'], // Blue for included, grey for excluded
      stroke: {
        curve: 'straight',
        width: [2, 0] // Line for included series, no line for excluded series
      },
      fill: {
        opacity: 1
      },
      dataLabels: {
        enabled: false
      },
      markers: {
        size: [5, 5], // Same size for both
        fillOpacity: [1, 1],
        strokeWidth: [2, 2],
        strokeColors: ['#fff', '#fff'],
        hover: {
          size: 7
        },
        discrete: [
          // Mark intercourse days with pink markers
          // For included BBT series (seriesIndex 0)
          ...(cycle?.days
            .filter((day: any) => day.hadIntercourse && day.bbt !== null && !day.excludeFromInterpretation)
            .map((day: any) => {
              const dataPointIndex = includedBBTDays.findIndex((d: any) => d.id === day.id);
              return dataPointIndex !== -1 ? {
                seriesIndex: 0,
                dataPointIndex: dataPointIndex,
                fillColor: '#ec4899',
                strokeColor: '#fff',
                size: 5
              } : null;
            })
            .filter(marker => marker !== null) || []),
          // For excluded BBT series (seriesIndex 1)
          ...(cycle?.days
            .filter((day: any) => day.hadIntercourse && day.bbt !== null && day.excludeFromInterpretation)
            .map((day: any) => {
              const dataPointIndex = excludedBBTDays.findIndex((d: any) => d.id === day.id);
              return dataPointIndex !== -1 ? {
                seriesIndex: 1,
                dataPointIndex: dataPointIndex,
                fillColor: '#ec4899',
                strokeColor: '#fff',
                size: 5
              } : null;
            })
            .filter(marker => marker !== null) || [])
        ]
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
        custom: function({ seriesIndex, dataPointIndex }) {
          // Determine if this is an included or excluded point based on seriesIndex
          const isExcluded = seriesIndex === 1;
          const daysList = isExcluded ? excludedBBTDays : includedBBTDays;
          
          // Get the day data from the list using the dataPointIndex
          const day = daysList[dataPointIndex];
          if (!day || !day.bbt) return '';
          
          const temp = settings.temperatureUnit === 'CELSIUS' 
            ? fahrenheitToCelsius(day.bbt).toFixed(2)
            : day.bbt.toFixed(2);
          const tempUnit = settings.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
          
          return `
            <div class="p-3 bg-white border rounded shadow-lg">
              <div class="font-bold mb-1">Day ${day.dayNumber}${isExcluded ? ' <span class="text-gray-500">(excluded)</span>' : ''}</div>
              <div class="text-sm">${formatDate(new Date(day.date))}</div>
              <div class="text-sm">${day.dayOfWeek}</div>
              <div class="font-semibold mt-2">${temp}${tempUnit}</div>
              ${day.bbtTime ? `<div class="text-sm">Time: ${day.bbtTime}</div>` : ''}
              ${day.hadIntercourse ? '<div class="text-sm text-pink-600">Intercourse</div>' : ''}
            </div>
          `;
        }
      },
      crosshairs: {
        show: false // Disabled - using custom crosshair overlay instead
      }
    };
  }, [settings, chartData, includedBBTDays, excludedBBTDays, cycle, navigate, yAxisRange, plotAreaWidth, plotAreaOffset]);

  const prevCycle = useMemo(() => {
    if (!cycle || !allCycles) return null;
    const currentIndex = allCycles.findIndex(c => c.id === cycle.id);
    return currentIndex < allCycles.length - 1 ? allCycles[currentIndex + 1] : null;
  }, [cycle, allCycles]);

  const nextCycle = useMemo(() => {
    if (!cycle || !allCycles) return null;
    const currentIndex = allCycles.findIndex(c => c.id === cycle.id);
    return currentIndex > 0 ? allCycles[currentIndex - 1] : null;
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
            <div ref={chartContainerRef} className="relative" style={{ paddingTop: '108px' }}>
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
                            className={`absolute flex items-center justify-center text-xs border-r border-b border-slate-300 bg-blue-50 transition-colors ${
                              isHovered ? 'bg-blue-200' : ''
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
                            className={`absolute flex items-center justify-center text-xs border-r border-b border-slate-300 bg-slate-100 transition-colors ${
                              isHovered ? 'bg-blue-200' : ''
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
                            className={`absolute flex items-center justify-center text-xs border-r border-b border-slate-200 bg-white transition-colors ${
                              isHovered ? 'bg-blue-200' : ''
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
                    width: '1px',
                    height: '100%',
                    background: '#b6b6b6',
                    backgroundImage: 'repeating-linear-gradient(0deg, #b6b6b6, #b6b6b6 4px, transparent 4px, transparent 8px)',
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

