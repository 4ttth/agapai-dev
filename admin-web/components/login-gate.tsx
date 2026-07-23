'use client';

import { useState } from 'react';

import { adminFetch, setAdminKey } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginGate({ onAuthed }: { onAuthed: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAdminKey(key.trim());
    try {
      await adminFetch('/admin/overview');
      onAuthed();
    } catch {
      setError('Invalid admin key, or the server is unreachable.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/agapai-logo.png" alt="AgapAI" className="mb-3 h-12 w-auto object-contain" />
          <CardTitle className="text-xl">Admin Console</CardTitle>
          <CardDescription>Enter the ADMIN_KEY configured on the server.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key">Admin key</Label>
              <Input
                id="key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !key.trim()}>
              {busy ? 'Checking…' : 'Enter console'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
