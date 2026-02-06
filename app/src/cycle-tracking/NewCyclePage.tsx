import React, { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserCycles, getUserSettings, createCycle, createOrUpdateCycleDay } from 'wasp/client/operations';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { formatDateForInput, celsiusToFahrenheit } from './utils';
import SideNav from './SideNav';

export default function NewCyclePage() {
  const navigate = useNavigate();
  const { data: cycles, isLoading: cyclesLoading } = useQuery(getUserCycles);
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);
  
  const [startDate, setStartDate] = useState(formatDateForInput(new Date()));
  const [bbt, setBbt] = useState('');
  const [bbtTime, setBbtTime] = useState('');
  const [hadIntercourse, setHadIntercourse] = useState(false);
  const [excludeFromInterpretation, setExcludeFromInterpretation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCycle = cycles?.find(c => c.isActive);
  const isLoading = cyclesLoading || settingsLoading;
  const tempUnit = settings?.temperatureUnit || 'FAHRENHEIT';
  const isCelsius = tempUnit === 'CELSIUS';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validate BBT if provided based on temperature unit
      if (bbt) {
        const tempValue = parseFloat(bbt);
        if (isNaN(tempValue)) {
          setError('BBT must be a valid number');
          setIsSubmitting(false);
          return;
        }
        
        // Validate based on temperature unit
        if (isCelsius) {
          if (tempValue < 35 || tempValue > 40) {
            setError('BBT must be a valid temperature between 35°C and 40°C');
            setIsSubmitting(false);
            return;
          }
        } else {
          if (tempValue < 95 || tempValue > 105) {
            setError('BBT must be a valid temperature between 95°F and 105°F');
            setIsSubmitting(false);
            return;
          }
        }
      }

      // Create the new cycle
      const newCycle = await createCycle({ startDate });

      // Create the first day entry if any data is provided
      const hasDayData = bbt || bbtTime || hadIntercourse;
      
      if (hasDayData) {
        // Convert temperature to Fahrenheit for storage if user entered in Celsius
        const bbtInFahrenheit = bbt 
          ? (isCelsius ? celsiusToFahrenheit(parseFloat(bbt)) : parseFloat(bbt))
          : undefined;

        await createOrUpdateCycleDay({
          cycleId: newCycle.id,
          date: startDate,
          bbt: bbtInFahrenheit,
          bbtTime: bbtTime || undefined,
          hadIntercourse,
          excludeFromInterpretation
        });
      }

      // Navigate to the new cycle's chart
      navigate(`/cycles/${newCycle.id}/chart`);
    } catch (err: any) {
      console.error('Failed to create cycle:', err);
      setError(err.message || 'Failed to create cycle. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex">
        <SideNav />
        <div className="flex-1 p-4 md:p-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <SideNav />
      <div className="flex-1 p-4 md:p-8 max-w-3xl">
        <div className="mb-4 md:mb-6">
          <h1 className="text-xl md:text-3xl font-bold mb-2">Begin New Cycle</h1>
          <p className="text-muted-foreground">
            Start tracking a new fertility cycle and optionally record your first day&apos;s data.
          </p>
        </div>

        {activeCycle && (
          <Alert className="mb-6 border-amber-500 bg-amber-50">
            <AlertTitle className="text-amber-900">Active Cycle Will Be Ended</AlertTitle>
            <AlertDescription className="text-amber-800">
              You currently have an active cycle (Cycle #{activeCycle.cycleNumber}, started{' '}
              {new Date(activeCycle.startDate).toLocaleDateString()}). Starting a new cycle will
              automatically end this cycle.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mb-6 border-red-500 bg-red-50">
            <AlertTitle className="text-red-900">Error</AlertTitle>
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Cycle Start Date</CardTitle>
              <CardDescription>
                Select the date when your new cycle begins (defaults to today)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <label htmlFor="startDate" className="block text-sm font-medium">
                  Start Date *
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>First Day Entry (Optional)</CardTitle>
              <CardDescription>
                You can optionally record data for the first day of your cycle now, or add it later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="bbt" className="block text-sm font-medium">
                    Basal Body Temperature ({isCelsius ? '°C' : '°F'})
                  </label>
                  <input
                    type="number"
                    id="bbt"
                    value={bbt}
                    onChange={(e) => setBbt(e.target.value)}
                    step={isCelsius ? "0.01" : "0.01"}
                    min={isCelsius ? "35" : "95"}
                    max={isCelsius ? "40" : "105"}
                    placeholder={isCelsius ? "e.g., 36.5" : "e.g., 97.5"}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your temperature taken first thing in the morning
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="bbtTime" className="block text-sm font-medium">
                    Time Taken
                  </label>
                  <input
                    type="time"
                    id="bbtTime"
                    value={bbtTime}
                    onChange={(e) => setBbtTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    When you took your temperature
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="hadIntercourse"
                    checked={hadIntercourse}
                    onChange={(e) => setHadIntercourse(e.target.checked)}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="hadIntercourse" className="text-sm font-medium cursor-pointer">
                    Had intercourse
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="excludeFromInterpretation"
                    checked={excludeFromInterpretation}
                    onChange={(e) => setExcludeFromInterpretation(e.target.checked)}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="excludeFromInterpretation" className="text-sm font-medium cursor-pointer">
                    Exclude from interpretation
                  </label>
                  <span className="text-xs text-muted-foreground ml-2">
                    (e.g., due to illness or irregular sleep)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/cycles')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Begin New Cycle'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

