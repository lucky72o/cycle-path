import { useMemo, useRef, useEffect, useState } from 'react';
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
  const [labelSpacing, setLabelSpacing] = useState<number>(0);
  const [labelPositions, setLabelPositions] = useState<number[]>([]);

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
    
    // Build series data with {x, y} format for numeric x-axis
    const includedData = includedBBTDays.map((day: any) => {
      const temp = tempUnit === 'CELSIUS' 
        ? fahrenheitToCelsius(day.bbt!)
        : day.bbt!;
      return {
        x: day.dayNumber,
        y: Number(temp.toFixed(2))
      };
    });
    
    const excludedData = excludedBBTDays.map((day: any) => {
      const temp = tempUnit === 'CELSIUS' 
        ? fahrenheitToCelsius(day.bbt!)
        : day.bbt!;
      return {
        x: day.dayNumber,
        y: Number(temp.toFixed(2))
      };
    });

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

    // Collect all temperature values from both series (extract y values from {x, y} objects)
    const allTemperatures = chartData.series.flatMap(series => 
      series.data.map((point: any) => point.y)
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
        events: {
          dataPointMouseEnter: function(_event: any, _chartContext: any, config: any) {
            // Get the day number from the x value of the data point
            const seriesIndex = config.seriesIndex;
            const dataPointIndex = config.dataPointIndex;
            
            if (seriesIndex >= 0 && dataPointIndex >= 0) {
              const daysList = seriesIndex === 0 ? includedBBTDays : excludedBBTDays;
              const day = daysList[dataPointIndex];
              if (day) {
                setHoveredDayNumber(day.dayNumber);
              }
            }
          },
          dataPointMouseLeave: function() {
            setHoveredDayNumber(null);
          }
        }
      },
      grid: {
        padding: {
          left: 100, // Increased to accommodate the "Cycle Day" label
          right: 10 // Enough padding to ensure last data point is fully visible
        },
        show: true,
        clipMarkers: false // Don't clip markers at the edge
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
          // Mark intercourse days in the included BBT series with pink markers
          ...(cycle?.days
            .filter((day: any) => day.hadIntercourse && day.bbt !== null && !day.excludeFromInterpretation)
            .map((day: any) => ({
              seriesIndex: 0, // First series (included BBT)
              dataPointIndex: includedBBTDays.findIndex((d: any) => d.id === day.id),
              fillColor: '#ec4899',
              strokeColor: '#fff',
              size: 5
            }))
            .filter((marker: any) => marker.dataPointIndex !== -1) || []),
          // Mark intercourse days in the excluded BBT series with pink markers
          ...(cycle?.days
            .filter((day: any) => day.hadIntercourse && day.bbt !== null && day.excludeFromInterpretation)
            .map((day: any) => ({
              seriesIndex: 1, // Second series (excluded BBT)
              dataPointIndex: excludedBBTDays.findIndex((d: any) => d.id === day.id),
              fillColor: '#ec4899',
              strokeColor: '#fff',
              size: 5
            }))
            .filter((marker: any) => marker.dataPointIndex !== -1) || [])
        ]
      },
      xaxis: {
        type: 'numeric',
        title: {
          text: undefined
        },
        min: chartData.minDay,
        max: chartData.maxDay,
        tickAmount: chartData.maxDay - chartData.minDay,
        floating: false,
        position: 'top',
        labels: {
          formatter: (value: string) => Math.round(Number(value)).toString(),
          offsetY: -5,
          rotate: 0
        },
        axisBorder: {
          show: true,
          offsetY: -1
        },
        axisTicks: {
          show: true,
          offsetY: -1
        }
      },
      yaxis: {
        title: {
          text: `Temperature (${tempUnit})`
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
          }
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
          if (!day) return '';
          
          const temp = settings.temperatureUnit === 'CELSIUS' 
            ? fahrenheitToCelsius(day.bbt!).toFixed(2)
            : day.bbt!.toFixed(2);
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
        show: true,
        position: 'back',
        stroke: {
          color: '#b6b6b6',
          width: 1,
          dashArray: 4
        }
      }
    };
  }, [settings, chartData, includedBBTDays, excludedBBTDays, cycle, navigate, yAxisRange]);

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

  // Handle chart container resize and calculate cell widths
  useEffect(() => {
    const updateChartDimensions = () => {
      if (chartContainerRef.current) {
        // Get the x-axis labels group
        const xAxisLabels = chartContainerRef.current.querySelector('.apexcharts-xaxis-texts-g');
        if (xAxisLabels) {
          const labels = xAxisLabels.querySelectorAll('text');
          if (labels.length >= 2) {
            // Get the container's position for relative calculations
            const containerRect = chartContainerRef.current.getBoundingClientRect();
            
            // Get all label positions by measuring their actual rendered position
            const positions: number[] = [];
            labels.forEach((label) => {
              const labelRect = label.getBoundingClientRect();
              // Calculate center of label relative to container
              const labelCenter = labelRect.left + labelRect.width / 2 - containerRect.left;
              positions.push(labelCenter);
            });
            
            // Calculate the spacing between labels
            const spacing = positions.length >= 2 ? positions[1] - positions[0] : 0;
            
            setLabelSpacing(spacing);
            setLabelPositions(positions);
          }
        }
      }
    };

    // Initial width calculation with delay to ensure chart is rendered
    const timer = setTimeout(updateChartDimensions, 300);

    // Setup resize observer
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updateChartDimensions, 100);
    });
    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [chartData]);

  // Calculate cell width for custom x-axis rows
  const cellWidth = labelSpacing; // Use the label spacing directly as cell width

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
          {chartData ? (
            <div ref={chartContainerRef} className="relative">
              {/* Custom X-axis rows with labels */}
              {chartData && cellWidth > 0 && labelPositions.length > 0 && (
                <div className="relative">
                  {/* Date Row */}
                  <div 
                    className="relative bg-blue-50 border-b border-slate-300"
                    style={{
                      height: '36px' // Fixed height for the row
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const dateLabel = datesMap.get(dayNumber) || '';
                      const isHovered = hoveredDayNumber === dayNumber;
                      const xPosition = labelPositions[i] || 0;
                      
                      return (
                        <div
                          key={dayNumber}
                          className={`absolute flex items-center justify-center transition-colors duration-150 ${
                            isHovered ? 'bg-blue-200' : ''
                          }`}
                          style={{ 
                            left: `${xPosition}px`,
                            width: `${cellWidth}px`,
                            top: 0,
                            height: '100%',
                            fontSize: '12px',
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            color: '#373d3f',
                            transform: 'translateX(-50%)'
                          }}
                        >
                          {dateLabel}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Date Label - positioned absolutely to align with Week Day label */}
                  <div 
                    className="absolute flex items-center justify-end pr-3" 
                    style={{ 
                      width: '80px',
                      top: 0,
                      left: 0,
                      height: '36px',
                      fontSize: '12px',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      color: '#373d3f',
                      whiteSpace: 'nowrap',
                      backgroundColor: 'rgb(239 246 255)', // bg-blue-50
                      borderBottom: '1px solid rgb(203 213 225)' // border-slate-300
                    }}
                  >
                    Date
                  </div>
                  
                  {/* Week Days Row */}
                  <div 
                    className="relative bg-slate-100 border-b-2 border-slate-300"
                    style={{
                      height: '36px' // Fixed height for the row
                    }}
                  >
                    {Array.from({ length: chartData.maxDay - chartData.minDay + 1 }, (_, i) => {
                      const dayNumber = chartData.minDay + i;
                      const weekDay = weekDaysMap.get(dayNumber) || '';
                      const isHovered = hoveredDayNumber === dayNumber;
                      const xPosition = labelPositions[i] || 0;
                      
                      return (
                        <div
                          key={dayNumber}
                          className={`absolute flex items-center justify-center transition-colors duration-150 ${
                            isHovered ? 'bg-blue-200' : ''
                          }`}
                          style={{ 
                            left: `${xPosition}px`, // xPosition is now the actual center point in container coordinates
                            width: `${cellWidth}px`,
                            top: 0,
                            height: '100%',
                            fontSize: '12px',
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            color: '#373d3f',
                            transform: 'translateX(-50%)' // Center the cell on that point
                          }}
                        >
                          {weekDay}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Week Day Label - positioned absolutely to align with Cycle Day label */}
                  <div 
                    className="absolute flex items-center justify-end pr-3" 
                    style={{ 
                      width: '80px',
                      top: '36px', // Position below Date row
                      left: 0,
                      height: '36px', // Match the week days row height
                      fontSize: '12px',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      color: '#373d3f',
                      whiteSpace: 'nowrap',
                      backgroundColor: 'rgb(241 245 249)', // bg-slate-100 to match the row
                      borderBottom: '2px solid rgb(203 213 225)' // border-slate-300 to match
                    }}
                  >
                    Week Day
                  </div>
                  
                  {/* Cycle Day Label - positioned to align with x-axis labels */}
                  <div 
                    className="absolute flex items-end justify-end pr-3" 
                    style={{ 
                      width: '80px',
                      top: 'calc(100% + 1px)', // Position right below the border (100% already includes both Date and Week Day rows)
                      left: 0,
                      height: '25px', // Align with x-axis label height
                      fontSize: '12px',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      color: '#373d3f',
                      paddingBottom: '5px', // Fine-tune vertical alignment with numbers
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Cycle Day
                  </div>
                </div>
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

