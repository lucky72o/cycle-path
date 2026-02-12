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
        <div className="flex-1 p-4 md:p-8">
          <div className="text-center">Loading...</div>
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
      <div className="flex-1 p-4 md:p-8 max-w-6xl">
      <div className="mb-4 md:mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold mb-2">Cycle #{cycle.cycleNumber}: Cycle Days</h1>
          <p className="text-muted-foreground">
            Started: {new Date(cycle.startDate).toLocaleDateString()}
            {cycle.endDate && ` - Ended: ${new Date(cycle.endDate).toLocaleDateString()}`}
          </p>
        </div>
        <Link to="/cycles/new">
          <Button variant="default">
            <span className="sm:hidden">Cycle +</span>
            <span className="hidden sm:inline">Begin new cycle</span>
          </Button>
        </Link>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-end items-center gap-2">
            <Link to={`/cycles/${cycle.id}/add-day`}>
              <Button aria-label="Add Cycle Day">
                <svg className="w-4 h-4 sm:mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <span className="hidden sm:inline">Add Cycle Day</span>
              </Button>
            </Link>
            <Link to={`/cycles/${cycle.id}/chart`}>
              <Button style={{ backgroundColor: '#e6a556' }} aria-label="View Graph">
                <svg className="w-4 h-4 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19V5m0 14h16M7 14l4-5 4 3 3-4" />
                </svg>
                <span className="hidden sm:inline">View Graph</span>
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {cycle.days.length > 0 ? (
            <>
              {/* Mobile card layout */}
              <div className="md:hidden space-y-3">
                {cycle.days.map((day) => (
                  <div key={day.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">Day {day.dayNumber}</span>
                      <span className="text-sm text-muted-foreground">{formatDate(new Date(day.date))} ({day.dayOfWeek})</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2">
                      <span>
                        BBT:{' '}
                        {day.bbt ? (
                          <>
                            {settings ? formatTemperature(day.bbt, settings.temperatureUnit) : `${day.bbt.toFixed(2)}°F`}
                            {day.excludeFromInterpretation && (
                              <span className="text-xs text-muted-foreground ml-1">(excl)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </span>
                      {day.bbtTime && <span>Time: {day.bbtTime}</span>}
                      {day.opkStatus && (
                        <span>
                          LH:{' '}
                          {day.opkStatus === 'low' && 'Low'}
                          {day.opkStatus === 'rising' && 'Rising'}
                          {day.opkStatus === 'peak' && 'Peak'}
                          {day.opkStatus === 'declining' && 'Declining'}
                        </span>
                      )}
                      {day.hadIntercourse && <span className="text-pink-600">♥ Intimacy</span>}
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/cycles/${cycle.id}/add-day?dayId=${day.id}`}>
                        <Button size="sm" variant="outline" aria-label="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        aria-label="Delete"
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
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Cycle Day</th>
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Week Day</th>
                      <th className="text-left py-3 px-4">BBT</th>
                      <th className="text-left py-3 px-4">Time</th>
                      <th className="text-left py-3 px-4">LH Test</th>
                      <th className="text-left py-3 px-4">Intimacy</th>
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
                                <span className="text-xs text-muted-foreground ml-1">(excl.)</span>
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
                          {day.opkStatus ? (
                            <span className="text-sm">
                              {day.opkStatus === 'low' && 'Low'}
                              {day.opkStatus === 'rising' && 'Rising'}
                              {day.opkStatus === 'peak' && 'Peak'}
                              {day.opkStatus === 'declining' && 'Declining'}
                            </span>
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
            </>
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
            <Button variant="outline">
              <span className="sm:hidden">← #{prevCycle.cycleNumber}</span>
              <span className="hidden sm:inline">← Previous Cycle (#{prevCycle.cycleNumber})</span>
            </Button>
          </Link>
        ) : (
          <div></div>
        )}
        {nextCycle ? (
          <Link to={`/cycles/${nextCycle.id}/days`}>
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

