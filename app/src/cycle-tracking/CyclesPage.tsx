import { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserCycles } from 'wasp/client/operations';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { formatDateForInput } from './utils';
import SideNav from './SideNav';

export default function CyclesPage() {
  const navigate = useNavigate();
  const { data: cycles, isLoading, error } = useQuery(getUserCycles);
  const [startDate, setStartDate] = useState(formatDateForInput(new Date()));
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const handleImportCsv = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const csvText = await importFile.text();
      const { importCycleCsv } = await import('wasp/client/operations');
      const result = await importCycleCsv({ csvText });
      setImportSuccess(
        `Imported ${result.updatedDays} day(s). Temp unit: ${result.detectedUnit}. ${result.createdCycle ? 'Created a new cycle.' : 'Updated existing cycle.'}`
      );
      navigate(`/cycles/${result.cycleId}/chart`);
    } catch (err: any) {
      console.error('Failed to import CSV:', err);
      setImportError(err.message || 'Failed to import CSV');
    } finally {
      setIsImporting(false);
    }
  };

  const handleStartNewCycle = async () => {
    try {
      const { createCycle } = await import('wasp/client/operations');
      const newCycle = await createCycle({ startDate });
      navigate(`/cycles/${newCycle.id}/chart`);
    } catch (err: any) {
      console.error('Failed to create cycle:', err);
      alert(err.message || 'Failed to create cycle');
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

  if (error) {
    return (
      <div className="flex">
        <SideNav />
        <div className="flex-1 p-8">
          <div className="text-center text-red-600">Error loading cycles: {error.message}</div>
        </div>
      </div>
    );
  }

  const activeCycle = cycles?.find(c => c.isActive);
  const pastCycles = cycles?.filter(c => !c.isActive) || [];

  return (
    <div className="flex">
      <SideNav />
      <div className="flex-1 p-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Cycles</h1>
          <Link to="/cycles/new">
            <Button variant="default">Begin new cycle</Button>
          </Link>
        </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Import cycle from CSV</CardTitle>
          <CardDescription>
            Upload a CSV export to create or update a cycle by date. We auto-detect temperature unit and overwrite matching days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="w-full sm:w-auto"
            />
            <Button onClick={handleImportCsv} disabled={!importFile || isImporting}>
              {isImporting ? 'Importing...' : 'Import CSV'}
            </Button>
          </div>
          {importSuccess && (
            <p className="text-sm text-green-700 mt-2">
              {importSuccess}
            </p>
          )}
          {importError && (
            <p className="text-sm text-red-600 mt-2">
              {importError}
            </p>
          )}
        </CardContent>
      </Card>

      {!activeCycle && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Start a New Cycle</CardTitle>
            <CardDescription>Begin tracking your current fertility cycle</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label htmlFor="startDate" className="block text-sm font-medium mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <Button onClick={handleStartNewCycle}>Start New Cycle</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeCycle && (
        <Card className="mb-8 border-primary">
          <CardHeader>
            <CardTitle>Current Cycle (#{activeCycle.cycleNumber})</CardTitle>
            <CardDescription>
              Started: {new Date(activeCycle.startDate).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Link to={`/cycles/${activeCycle.id}/add-day`}>
                <Button>Add Day</Button>
              </Link>
              <Link to={`/cycles/${activeCycle.id}/days`}>
                <Button variant="outline">View Days</Button>
              </Link>
              <Link to={`/cycles/${activeCycle.id}/chart`}>
                <Button variant="outline">View Graph</Button>
              </Link>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={async () => {
                  if (confirm('Are you sure you want to delete this cycle? This will delete all cycle days as well.')) {
                    try {
                      const { deleteCycle } = await import('wasp/client/operations');
                      await deleteCycle({ cycleId: activeCycle.id });
                      window.location.reload();
                    } catch (err: any) {
                      alert(err.message || 'Failed to delete cycle');
                    }
                  }
                }}
              >
                Delete Cycle
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pastCycles.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Past Cycles</h2>
          <div className="space-y-4">
            {pastCycles.map((cycle) => (
              <Card key={cycle.id}>
                <CardHeader>
                  <CardTitle>Cycle #{cycle.cycleNumber}</CardTitle>
                  <CardDescription>
                    {new Date(cycle.startDate).toLocaleDateString()} - {' '}
                    {cycle.endDate ? new Date(cycle.endDate).toLocaleDateString() : 'Ongoing'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/cycles/${cycle.id}/days`}>
                      <Button size="sm">View Days</Button>
                    </Link>
                    <Link to={`/cycles/${cycle.id}/chart`}>
                      <Button size="sm" variant="outline">View Graph</Button>
                    </Link>
                    <Button 
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (confirm('Are you sure you want to delete this cycle? This will delete all cycle days as well.')) {
                          try {
                            const { deleteCycle } = await import('wasp/client/operations');
                            await deleteCycle({ cycleId: cycle.id });
                            window.location.reload();
                          } catch (err: any) {
                            alert(err.message || 'Failed to delete cycle');
                          }
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {cycles && cycles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="mb-4">You haven&apos;t started tracking any cycles yet.</p>
          <p>Start your first cycle above to begin!</p>
        </div>
      )}
      </div>
    </div>
  );
}

