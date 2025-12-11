import { useMemo } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleById, getUserSettings, getUserCycles } from 'wasp/client/operations';
import { useParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { formatTemperature, formatDate } from './utils';
import SideNav from './SideNav';

export default function CycleDaysPage() {
  const { cycleId } = useParams();
  
  const { data: allCycles } = useQuery(getUserCycles);
  const { data: cycle, isLoading: cycleLoading } = useQuery(getCycleById, { cycleId: cycleId || '' }, { enabled: !!cycleId });
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);

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
          <div className="text-center">Loading...</div>
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
            <p className="mb-4">Cycle not found.</p>
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
        <h1 className="text-3xl font-bold mb-2">Cycle #{cycle.cycleNumber}: Cycle Days</h1>
        <p className="text-muted-foreground">
          Started: {new Date(cycle.startDate).toLocaleDateString()}
          {cycle.endDate && ` - Ended: ${new Date(cycle.endDate).toLocaleDateString()}`}
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-end items-center">
            <Link to={`/cycles/${cycle.id}/add-day`}>
              <Button>Add Cycle Day</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {cycle.days.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Cycle Day</th>
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">Day of Week</th>
                    <th className="text-left py-3 px-4">BBT</th>
                    <th className="text-left py-3 px-4">BBT Time</th>
                    <th className="text-left py-3 px-4">Intercourse</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cycle.days.map((day) => (
                    <tr key={day.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{day.dayNumber}</td>
                      <td className="py-3 px-4">{formatDate(new Date(day.date))}</td>
                      <td className="py-3 px-4">{day.dayOfWeek}</td>
                      <td className="py-3 px-4">
                        {day.bbt ? (
                          <span>
                            {settings ? formatTemperature(day.bbt, settings.temperatureUnit) : `${day.bbt.toFixed(2)}°F`}
                            {day.excludeFromInterpretation && (
                              <span className="text-xs text-muted-foreground ml-1">(excluded)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {day.bbtTime ? (
                          <span className="text-sm">{day.bbtTime}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {day.hadIntercourse ? (
                          <span className="text-pink-600">✓</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Link to={`/cycles/${cycle.id}/add-day?dayId=${day.id}`}>
                            <Button size="sm" variant="ghost">Edit</Button>
                          </Link>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this cycle day entry?')) {
                                try {
                                  const { deleteCycleDay } = await import('wasp/client/operations');
                                  await deleteCycleDay({ cycleDayId: day.id });
                                  window.location.reload();
                                } catch (err: any) {
                                  alert(err.message || 'Failed to delete cycle day');
                                }
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-4">No entries recorded yet.</p>
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
          <Link to={`/cycles/${prevCycle.id}/days`}>
            <Button variant="outline">← Previous Cycle (#{prevCycle.cycleNumber})</Button>
          </Link>
        ) : (
          <div></div>
        )}
        {nextCycle ? (
          <Link to={`/cycles/${nextCycle.id}/days`}>
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

