import React, { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserCycles, getUserSettings, createCycle, createOrUpdateCycleDay } from 'wasp/client/operations';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Info } from 'lucide-react';
import { formatDateForInput, celsiusToFahrenheit } from './utils';
import SideNav from './SideNav';

export default function NewCyclePage() {
  const navigate = useNavigate();
  const { data: cycles, isLoading: cyclesLoading } = useQuery(getUserCycles);
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);
  
  type AppearanceOption = 'NONE' | 'STICKY' | 'CREAMY' | 'WATERY' | 'EGGWHITE';
  type SensationOption = 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY';
  type MenstrualFlowOption = 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'VERY_HEAVY';
  
  const [startDate, setStartDate] = useState(formatDateForInput(new Date()));
  const [bbt, setBbt] = useState('');
  const [bbtTime, setBbtTime] = useState('');
  const [hadIntercourse, setHadIntercourse] = useState(false);
  const [excludeFromInterpretation, setExcludeFromInterpretation] = useState(false);
  const [cervicalAppearance, setCervicalAppearance] = useState<AppearanceOption | ''>('');
  const [cervicalSensation, setCervicalSensation] = useState<SensationOption | ''>('');
  const [menstrualFlow, setMenstrualFlow] = useState<MenstrualFlowOption | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCycle = cycles?.find(c => c.isActive);
  const isLoading = cyclesLoading || settingsLoading;
  const tempUnit = settings?.temperatureUnit || 'FAHRENHEIT';
  const isCelsius = tempUnit === 'CELSIUS';

  const InfoTooltip = ({ text }: { text: string }) => (
    <span className="relative inline-flex items-center group">
      <span className="inline-flex items-center justify-center rounded-full border border-muted-foreground/40 text-muted-foreground h-5 w-5 text-[10px]">
        <Info className="h-3 w-3" />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-normal text-left w-64 rounded bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow group-hover:opacity-100 transition-opacity duration-100">
        {text}
      </span>
    </span>
  );

  const appearanceOptions: { value: AppearanceOption; label: string; description: string }[] = [
    { value: 'NONE', label: 'None', description: 'Nothing visible when you wipe' },
    { value: 'STICKY', label: 'Sticky', description: 'Thick, crumbly, glue-like' },
    { value: 'CREAMY', label: 'Creamy', description: 'Lotion-like, smooth, white' },
    { value: 'WATERY', label: 'Watery', description: 'Thin, clear, looks like water' },
    { value: 'EGGWHITE', label: 'Eggwhite', description: 'Clear, stretchy, slippery. Most fertile' }
  ];

  const sensationOptions: { value: SensationOption; label: string }[] = [
    { value: 'DRY', label: 'Dry' },
    { value: 'DAMP', label: 'Damp' },
    { value: 'WET', label: 'Wet' },
    { value: 'SLIPPERY', label: 'Slippery' }
  ];

  const menstrualFlowOptions: { value: MenstrualFlowOption; label: string; tooltip?: string }[] = [
    {
      value: 'SPOTTING',
      label: 'Spotting',
      tooltip:
        "Not counted as a full period day. Very small drops of blood. Often brown or pink. Doesn't need a full pad or tampon. Happens before or after the main period."
    },
    { value: 'LIGHT', label: 'Light' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HEAVY', label: 'Heavy' },
    { value: 'VERY_HEAVY', label: 'Very Heavy' }
  ];

  const handleAppearanceToggle = (value: AppearanceOption) => {
    setCervicalAppearance((prev) => (prev === value ? '' : value));
  };

  const handleSensationToggle = (value: SensationOption) => {
    setCervicalSensation((prev) => (prev === value ? '' : value));
  };

  const handleMenstrualFlowToggle = (value: MenstrualFlowOption) => {
    setMenstrualFlow((prev) => (prev === value ? '' : value));
  };

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
      const hasDayData = bbt || bbtTime || hadIntercourse || cervicalAppearance || cervicalSensation || menstrualFlow;
      
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
          excludeFromInterpretation,
          cervicalAppearance: cervicalAppearance || null,
          cervicalSensation: cervicalSensation || null,
          menstrualFlow: menstrualFlow || null
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
                  <Checkbox
                    id="hadIntercourse"
                    checked={hadIntercourse}
                    onCheckedChange={(checked) => setHadIntercourse(checked as boolean)}
                  />
                  <Label htmlFor="hadIntercourse" className="cursor-pointer">
                    Had intercourse
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="excludeFromInterpretation"
                    checked={excludeFromInterpretation}
                    onCheckedChange={(checked) => setExcludeFromInterpretation(checked as boolean)}
                  />
                  <Label htmlFor="excludeFromInterpretation" className="cursor-pointer">
                    Exclude from interpretation
                  </Label>
                  <span className="text-xs text-muted-foreground ml-2">
                    (e.g., due to illness or irregular sleep)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Menstrual Flow (Optional)</CardTitle>
              <CardDescription>
                Record your menstrual flow level for the first day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {menstrualFlowOptions.map((option) => (
                  <div key={option.value} className="flex items-start gap-2">
                    <Checkbox
                      id={`menstrualFlow-${option.value}`}
                      checked={menstrualFlow === option.value}
                      onCheckedChange={() => handleMenstrualFlowToggle(option.value)}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={`menstrualFlow-${option.value}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <span>{option.label}</span>
                      {option.tooltip && <InfoTooltip text={option.tooltip} />}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Cervical Fluid (Optional)</CardTitle>
              <CardDescription>
                Record cervical fluid appearance and sensation for the first day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Appearance</p>
                  <div className="space-y-2">
                    {appearanceOptions.map((option) => (
                      <div key={option.value} className="flex items-start gap-2">
                        <Checkbox
                          id={`appearance-${option.value}`}
                          checked={cervicalAppearance === option.value}
                          onCheckedChange={() => handleAppearanceToggle(option.value)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`appearance-${option.value}`}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <span>{option.label}</span>
                          <InfoTooltip text={option.description} />
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Sensation</p>
                  <div className="space-y-2">
                    {sensationOptions.map((option) => (
                      <div key={option.value} className="flex items-center gap-2">
                        <Checkbox
                          id={`sensation-${option.value}`}
                          checked={cervicalSensation === option.value}
                          onCheckedChange={() => handleSensationToggle(option.value)}
                        />
                        <Label
                          htmlFor={`sensation-${option.value}`}
                          className="cursor-pointer"
                        >
                          {option.label}
                        </Label>
                      </div>
                    ))}
                  </div>
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

