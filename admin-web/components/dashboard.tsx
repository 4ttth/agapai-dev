'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { LogOut } from 'lucide-react';

import { clearAdminKey, swrFetcher, type Overview } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Charts } from '@/components/charts';
import { PendingTable } from '@/components/pending-table';
import { ServiceHealth } from '@/components/service-health';
import { StatCards } from '@/components/stat-cards';
import { UsersTable } from '@/components/users-table';

export function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const { data, error, isValidating } = useSWR<Overview>('/admin/overview', swrFetcher, {
    refreshInterval: 15000,
  });
  const [updatedAt, setUpdatedAt] = useState<string>('');

  useEffect(() => {
    if (data) setUpdatedAt(new Date().toLocaleTimeString());
  }, [data]);

  const signOut = () => {
    clearAdminKey();
    onSignOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/agapai-icon.png"
              alt="AgapAI"
              className="h-9 w-9 rounded-lg border bg-white object-contain"
            />
            <div>
              <h1 className="text-lg font-semibold leading-tight">AgapAI — Admin Console</h1>
              <p className="text-xs text-muted-foreground">Service health · usage · verification</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <span
                className={`h-2 w-2 rounded-full ${isValidating ? 'animate-pulse bg-primary' : 'bg-success'}`}
              />
              {updatedAt ? `Live · updated ${updatedAt}` : 'Connecting…'}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Could not load data from the server. It may be unreachable, or your admin key was revoked.
          </div>
        ) : null}
        <StatCards data={data} />
        <Charts data={data} />
        <ServiceHealth data={data} />
        <PendingTable />
        <UsersTable />
      </main>
    </div>
  );
}
