import { useMemo } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleById, getUserSettings, getUserCycles } from 'wasp/client/operations';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import ReactApexChart from 'react-apexcharts';
import { formatTemperature, fahrenheitToCelsius, formatDate, formatDateLong } from './utils';
import type { ApexOptions } from 'apexcharts';
import SideNav from './SideNav';

export default function CycleChartPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  
  const { data: allCycles } = useQuery(getUserCycles);
  const { data: cycle, isLoading: cycleLoading } = useQuery(getCycleById, { cycleId: cycleId || '' }, { enabled: !!cycleId });
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);

  // If no cycleId provided, redirect to active cycle
  useMemo(() => {
    if (!cycleId && allCycles && allCycles.length > 0) {
      const activeCycle = allCycles.find(c => c.isActive);
      if (activeCycle) {
        navigate(`/cycles/${activeCycle.id}/chart`, { replace: true });
      }
    }
  }, [cycleId, allCycles, navigate]);

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

  const chartData = useMemo(() => {
    if (!allDaysWithBBT.length || !settings) return null;

    const tempUnit = settings.temperatureUnit;
    
    // Create a map for quick lookup
    const includedDaysMap = new Map(
      includedBBTDays.map((day: any) => [day.dayNumber, day])
    );
    const excludedDaysMap = new Map(
      excludedBBTDays.map((day: any) => [day.dayNumber, day])
    );
    
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

    // Get min and max day numbers for x-axis range
    const allDayNumbers = allDaysWithBBT.map((day: any) => day.dayNumber);
    const minDay = Math.min(...allDayNumbers);
    const maxDay = Math.max(...allDayNumbers);

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
      minDay,
      maxDay
    };
  }, [allDaysWithBBT, includedBBTDays, excludedBBTDays, settings]);

  // Calculate dynamic Y-axis range based on actual data (including excluded points)
  const yAxisRange = useMemo(() => {
    if (!chartData || !settings) return null;

    // Collect all temperature values from both series (extract y values from {x, y} objects)
    const allTemperatures = chartData.series.flatMap(series => 
      series.data.map((point: any) => point.y)
    );
    
    if (allTemperatures.length === 0) return null;

    const actualMin = Math.min(...allTemperatures);
    const actualMax = Math.max(...allTemperatures);

    // Default ranges
    const defaultRange = settings.temperatureUnit === 'CELSIUS' 
      ? { min: 36.0, max: 37.5 }
      : { min: 96.8, max: 99.5 }; // Equivalent Fahrenheit range

    // Use the wider range to ensure all data points are visible (including excluded ones)
    const min = Math.min(defaultRange.min, actualMin);
    const max = Math.max(defaultRange.max, actualMax);

    return { min, max };
  }, [chartData, settings]);

  const chartOptions: ApexOptions = useMemo(() => {
    if (!settings || !cycle || !yAxisRange) return {};
    
    const tempUnit = settings.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
    
    // Set Y-axis range and intervals based on temperature unit
    // Calculate tickAmount dynamically to show 0.1 degree increments
    const tempRange = yAxisRange.max - yAxisRange.min;
    const tickAmount = Math.round(tempRange / 0.1);
    
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
          show: true,
          tools: {
            customIcons: [
              {
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>',
                index: -1, // Places it before the menu button
                title: 'Add a day',
                class: 'custom-icon-add-day',
                click: function() {
                  navigate(`/cycles/${cycle.id}/add-day`);
                }
              }
            ]
          }
        },
        zoom: {
          enabled: true
        }
      },
      grid: {
        padding: {
          left: 20, // Add space between temperature readings and the left edge
          right: 10
        }
      },
      colors: ['#3b82f6', '#9CA3AF'], // Blue for included, grey for excluded
      stroke: {
        curve: 'straight',
        width: [2, 0] // Line for included series, no line for excluded series
      },
      markers: {
        size: [5, 5], // Same size for both
        fillOpacity: [1, 1],
        strokeWidth: [2, 2],
        strokeColors: ['#fff', '#fff'],
        hover: {
          size: 7
        }
      },
      xaxis: {
        type: 'numeric', // Use numeric axis to handle gaps properly
        title: {
          text: 'Cycle Day',
          offsetY: -10,
          style: {
            fontSize: '14px',
            fontWeight: 600
          }
        },
        min: chartData?.minDay || 1,
        max: chartData?.maxDay || 1,
        tickAmount: Math.min(chartData?.maxDay || 1, 30), // Limit to 30 ticks max for readability
        position: 'top',
        labels: {
          formatter: (value: string) => Math.round(Number(value)).toString(), // Show whole numbers only
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
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
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
      annotations: {
        xaxis: [],
        yaxis: [],
        points: cycle?.days
          .filter((day: any) => day.hadIntercourse && day.bbt !== null)
          .map((day: any) => {
            const temp = settings.temperatureUnit === 'CELSIUS' 
              ? fahrenheitToCelsius(day.bbt!)
              : day.bbt!;
            return {
              x: day.dayNumber, // This is now a numeric value matching our x-axis
              y: temp,
              marker: {
                size: 8,
                fillColor: '#ec4899',
                strokeColor: '#be185d',
                strokeWidth: 2
              }
            };
          })
          .filter(Boolean) as any[] || []
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
            <p className="mb-4">Cycle not found or you haven't started any cycles yet.</p>
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Cycle #{cycle.cycleNumber} Chart</h1>
        <p className="text-muted-foreground">
          Started: {formatDateLong(new Date(cycle.startDate))}
          {cycle.endDate && ` - Ended: ${formatDateLong(new Date(cycle.endDate))}`}
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Temperature Chart</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData && chartData.series[0].data.length > 0 ? (
            <ReactApexChart
              options={chartOptions}
              series={chartData.series}
              type="line"
              height={400}
            />
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

