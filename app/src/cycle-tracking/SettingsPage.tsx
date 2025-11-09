import { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserSettings } from 'wasp/client/operations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import SideNav from './SideNav';

export default function SettingsPage() {
  const { data: settings, isLoading } = useQuery(getUserSettings);
  const [temperatureUnit, setTemperatureUnit] = useState<'FAHRENHEIT' | 'CELSIUS'>('FAHRENHEIT');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setTemperatureUnit(settings.temperatureUnit);
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { updateUserTemperaturePreference } = await import('wasp/client/operations');
      await updateUserTemperaturePreference({ temperatureUnit });
      alert('Settings saved successfully!');
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      alert(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex">
        <SideNav />
        <div className="flex-1 p-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <SideNav />
      <div className="flex-1 p-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>Temperature Units</CardTitle>
            <CardDescription>
              Choose how you want temperature values to be displayed throughout the app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base font-medium">Temperature Display</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="fahrenheit"
                    name="temperature"
                    value="FAHRENHEIT"
                    checked={temperatureUnit === 'FAHRENHEIT'}
                    onChange={(e) => setTemperatureUnit(e.target.value as 'FAHRENHEIT')}
                    className="w-4 h-4"
                  />
                  <label htmlFor="fahrenheit" className="cursor-pointer">
                    Fahrenheit (°F)
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="celsius"
                    name="temperature"
                    value="CELSIUS"
                    checked={temperatureUnit === 'CELSIUS'}
                    onChange={(e) => setTemperatureUnit(e.target.value as 'CELSIUS')}
                    className="w-4 h-4"
                  />
                  <label htmlFor="celsius" className="cursor-pointer">
                    Celsius (°C)
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

