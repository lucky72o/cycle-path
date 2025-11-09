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

  const daysWithBBT = useMemo(() => {
    if (!cycle) return [];
    return cycle.days.filter((day: any) => day.bbt !== null && !day.excludeFromInterpretation);
  }, [cycle]);

  const chartData = useMemo(() => {
    if (!daysWithBBT.length || !settings) return null;

    const tempUnit = settings.temperatureUnit;
    
    const temperatures = daysWithBBT.map((day: any) => {
      if (tempUnit === 'CELSIUS') {
        return fahrenheitToCelsius(day.bbt!).toFixed(2);
      }
      return day.bbt!.toFixed(2);
    });

    const dayNumbers = daysWithBBT.map((day: any) => day.dayNumber);

    return {
      series: [{
        name: 'BBT',
        data: temperatures.map(Number)
      }],
      categories: dayNumbers
    };
  }, [daysWithBBT, settings]);

  const chartOptions: ApexOptions = useMemo(() => {
    if (!settings) return {};
    
    const tempUnit = settings.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
    
    return {
      chart: {
        type: 'line',
        height: 400,
        toolbar: {
          show: true
        },
        zoom: {
          enabled: true
        }
      },
      stroke: {
        curve: 'straight',
        width: 2
      },
      markers: {
        size: 5,
        hover: {
          size: 7
        }
      },
      xaxis: {
        title: {
          text: 'Cycle Day'
        },
        categories: chartData?.categories || [],
        labels: {
          formatter: (value: string) => `Day ${value}`
        }
      },
      yaxis: {
        title: {
          text: `Temperature (${tempUnit})`
        },
        labels: {
          formatter: (value: number) => value.toFixed(2)
        }
      },
      tooltip: {
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          const day = daysWithBBT[dataPointIndex];
          if (!day) return '';
          
          const temp = settings.temperatureUnit === 'CELSIUS' 
            ? fahrenheitToCelsius(day.bbt!).toFixed(2)
            : day.bbt!.toFixed(2);
          const tempUnit = settings.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
          
          return `
            <div class="p-3 bg-white border rounded shadow-lg">
              <div class="font-bold mb-1">Day ${day.dayNumber}</div>
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
        points: cycle?.days
          .filter((day: any) => day.hadIntercourse && day.bbt !== null && !day.excludeFromInterpretation)
          .map((day: any) => {
            const index = daysWithBBT.findIndex((d: any) => d.id === day.id);
            if (index === -1) return null;
            
            return {
              x: daysWithBBT[index].dayNumber,
              y: settings.temperatureUnit === 'CELSIUS' 
                ? fahrenheitToCelsius(day.bbt!)
                : day.bbt!,
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
  }, [settings, chartData, daysWithBBT, cycle]);

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

