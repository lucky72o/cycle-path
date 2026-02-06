import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getCycleById, getUserSettings } from 'wasp/client/operations';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Info } from 'lucide-react';
import { formatDateForInput, convertToFahrenheitForStorage, fahrenheitToCelsius } from './utils';
import SideNav from './SideNav';

export default function AddCycleDayPage() {
  const { cycleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dayId = searchParams.get('dayId');
  
  const { data: cycle, isLoading: cycleLoading } = useQuery(getCycleById, { cycleId: cycleId || '' }, { enabled: !!cycleId });
  const { data: settings, isLoading: settingsLoading } = useQuery(getUserSettings);

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

  type AppearanceOption = 'NONE' | 'STICKY' | 'CREAMY' | 'WATERY' | 'EGGWHITE';
  type SensationOption = 'DRY' | 'DAMP' | 'WET' | 'SLIPPERY';
  type OpkStatusOption = 'low' | 'rising' | 'peak' | 'declining';
  type MenstrualFlowOption = 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'VERY_HEAVY';

  const [date, setDate] = useState(formatDateForInput(new Date()));
  const [bbt, setBbt] = useState('');
  const [bbtTime, setBbtTime] = useState('');
  const [hadIntercourse, setHadIntercourse] = useState(false);
  const [excludeFromInterpretation, setExcludeFromInterpretation] = useState(false);
  const [cervicalAppearance, setCervicalAppearance] = useState<AppearanceOption | ''>('');
  const [cervicalSensation, setCervicalSensation] = useState<SensationOption | ''>('');
  const [opkStatus, setOpkStatus] = useState<OpkStatusOption | ''>('');
  const [menstrualFlow, setMenstrualFlow] = useState<MenstrualFlowOption | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Find the existing day if we're editing
  const existingDay = dayId && cycle 
    ? cycle.days.find((d: any) => d.id === dayId)
    : null;

  // Pre-populate form when editing an existing day
  useEffect(() => {
    if (existingDay && settings) {
      setDate(formatDateForInput(new Date(existingDay.date)));
      
      // Convert temperature to user's preferred unit for display
      if (existingDay.bbt) {
        const tempForDisplay = settings.temperatureUnit === 'CELSIUS'
          ? fahrenheitToCelsius(existingDay.bbt).toFixed(2)
          : existingDay.bbt.toFixed(2);
        setBbt(tempForDisplay);
      }
      
      setBbtTime(existingDay.bbtTime || '');
      setHadIntercourse(existingDay.hadIntercourse || false);
      setExcludeFromInterpretation(existingDay.excludeFromInterpretation || false);
      setCervicalAppearance(existingDay.cervicalAppearance || '');
      setCervicalSensation(existingDay.cervicalSensation || '');
      setOpkStatus((existingDay.opkStatus as OpkStatusOption | undefined) || '');
      setMenstrualFlow((existingDay.menstrualFlow as MenstrualFlowOption | undefined) || '');
    }
  }, [existingDay, settings]);

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
        excludeFromInterpretation,
        cervicalAppearance: cervicalAppearance || null,
        cervicalSensation: cervicalSensation || null,
        opkStatus: opkStatus || null,
        menstrualFlow: menstrualFlow || null
      });

      // Reset form (only if adding, not editing)
      if (!existingDay) {
        setBbt('');
        setBbtTime('');
        setHadIntercourse(false);
        setExcludeFromInterpretation(false);
        setCervicalAppearance('');
        setCervicalSensation('');
        setOpkStatus('');
        setMenstrualFlow('');
      }
      
      // Redirect to days page
      navigate(`/cycles/${cycleId}/days`);
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

  const tempUnit = settings?.temperatureUnit === 'CELSIUS' ? '°C' : '°F';
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
        "Not counted as a full period day. Very small drops of blood. Often brown or pink. Doesn’t need a full pad or tampon. Happens before or after the main period."
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

  const opkOptions: { value: OpkStatusOption; label: string; description: string }[] = [
    {
      value: 'low',
      label: 'Low LH',
      description:
        'Faint line. The test line is much lighter than the control line. You are likely not yet in your fertile window.'
    },
    {
      value: 'rising',
      label: 'Rising LH',
      description:
        "Darker line. Your LH is starting to rise. The test line is getting darker, but it isn't as dark as the control line yet. This usually means your fertile window is opening and ovulation may be a few days away."
    },
    {
      value: 'peak',
      label: 'Peak LH – Surge',
      description:
        'Very dark line. Your LH has reached its highest level. The test line is as dark or darker than the control line. Ovulation typically happens within the next 24–36 hours, and this is your most fertile time.'
    },
    {
      value: 'declining',
      label: 'Declining LH',
      description:
        'Line fades. Your LH levels are now falling after the surge. This usually means ovulation has already happened or is finishing soon.'
    }
  ];


  return (
    <div className="flex">
      <SideNav />
      <div className="flex-1 p-4 md:p-8 max-w-4xl">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-3xl font-bold mb-2">
          Cycle #{cycle.cycleNumber}: {existingDay ? 'Edit' : 'Add'} Daily Entry
        </h1>
        <p className="text-muted-foreground">
          Started: {new Date(cycle.startDate).toLocaleDateString()}
          {existingDay && ` • Editing Day ${existingDay.dayNumber}`}
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
                Basal Body Temperature (your body&apos;s lowest resting temperature)
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

            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Menstrual Flow</h3>
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
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Cervical Fluid</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Appearance</p>
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
                  <p className="text-sm font-medium text-muted-foreground">Sensation</p>
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
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Ovulation Predictor Kit</h3>
              <div className="space-y-2">
                {opkOptions.map((option) => (
                  <div key={option.value} className="flex items-start gap-2">
                    <Checkbox
                      id={`opk-${option.value}`}
                      checked={opkStatus === option.value}
                      onCheckedChange={() =>
                        setOpkStatus((prev) => (prev === option.value ? '' : option.value))
                      }
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={`opk-${option.value}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <span>{option.label}</span>
                      <InfoTooltip text={option.description} />
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : existingDay ? 'Update Entry' : 'Save Entry'}
              </Button>
              <Link to={`/cycles/${cycle.id}/days`}>
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

