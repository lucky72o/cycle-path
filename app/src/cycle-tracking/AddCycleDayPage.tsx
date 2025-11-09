import { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleById, getUserSettings } from 'wasp/client/operations';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { formatDateForInput, convertToFahrenheitForStorage } from './utils';
import SideNav from './SideNav';

export default function AddCycleDayPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  
  const { data: cycle, isLoading: cycleLoading } = useQuery(getCycleById, { cycleId: cycleId || '' }, { enabled: !!cycleId });
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);

  const [date, setDate] = useState(formatDateForInput(new Date()));
  const [bbt, setBbt] = useState('');
  const [bbtTime, setBbtTime] = useState('');
  const [hadIntercourse, setHadIntercourse] = useState(false);
  const [excludeFromInterpretation, setExcludeFromInterpretation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate suggested next day number
  const suggestedDayNumber = cycle && cycle.days.length > 0
    ? Math.max(...cycle.days.map((d: any) => d.dayNumber)) + 1
    : 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleId) return;

    setIsSubmitting(true);
    try {
      const { createOrUpdateCycleDay } = await import('wasp/client/operations');
      
      // Convert temperature to Fahrenheit if user entered in Celsius
      const bbtValue = bbt ? parseFloat(bbt) : undefined;
      const bbtInFahrenheit = bbtValue && settings
        ? convertToFahrenheitForStorage(bbtValue, settings.temperatureUnit)
        : bbtValue;

      await createOrUpdateCycleDay({
        cycleId,
        date,
        bbt: bbtInFahrenheit,
        bbtTime: bbtTime || undefined,
        hadIntercourse,
        excludeFromInterpretation
      });

      // Reset form
      setBbt('');
      setBbtTime('');
      setHadIntercourse(false);
      setExcludeFromInterpretation(false);
      
      // Redirect to chart page
      navigate(`/cycles/${cycleId}/chart`);
    } catch (err: any) {
      console.error('Failed to save cycle day:', err);
      alert(err.message || 'Failed to save cycle day');
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const tempUnit = settings?.temperatureUnit === 'CELSIUS' ? '°C' : '°F';

  return (
    <div className="flex">
      <SideNav />
      <div className="flex-1 p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Cycle #{cycle.cycleNumber}: Add Daily Entry</h1>
        <p className="text-muted-foreground">
          Started: {new Date(cycle.startDate).toLocaleDateString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Measurements</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                This will be cycle day {suggestedDayNumber}
              </p>
            </div>

            <div>
              <Label htmlFor="bbt">
                BBT ({tempUnit})
              </Label>
              <Input
                id="bbt"
                type="number"
                step="0.01"
                value={bbt}
                onChange={(e) => setBbt(e.target.value)}
                placeholder={`e.g., ${settings?.temperatureUnit === 'CELSIUS' ? '36.5' : '97.8'}`}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Basal Body Temperature (your body's lowest resting temperature)
              </p>
            </div>

            <div>
              <Label htmlFor="bbtTime">BBT Time</Label>
              <Input
                id="bbtTime"
                type="time"
                value={bbtTime}
                onChange={(e) => setBbtTime(e.target.value)}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Time you took your temperature reading
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="hadIntercourse"
                checked={hadIntercourse}
                onCheckedChange={(checked) => setHadIntercourse(checked as boolean)}
              />
              <Label htmlFor="hadIntercourse" className="cursor-pointer">
                Intercourse
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="excludeFromInterpretation"
                checked={excludeFromInterpretation}
                onCheckedChange={(checked) => setExcludeFromInterpretation(checked as boolean)}
              />
              <Label htmlFor="excludeFromInterpretation" className="cursor-pointer">
                Exclude from BBT-based interpretation?
              </Label>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Entry'}
              </Button>
              <Link to={`/cycles/${cycle.id}/chart`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {cycle.days.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {cycle.days
                  .slice(-5)
                  .reverse()
                  .map((day: any) => (
                    <div key={day.id} className="flex justify-between items-center py-2 border-b last:border-b-0">
                      <div>
                        <span className="font-semibold">Day {day.dayNumber}</span> -{' '}
                        {new Date(day.date).toLocaleDateString()} ({day.dayOfWeek})
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {day.bbt ? `${day.bbt.toFixed(2)}°F` : 'No temp'}
                        {day.hadIntercourse && ' • Intercourse'}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}

