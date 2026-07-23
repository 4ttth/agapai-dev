'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2 } from 'lucide-react';

import { adminFetch, swrFetcher, type AdminUser } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function PendingTable() {
  const { data, mutate } = useSWR<{ users: AdminUser[] }>('/admin/pending', swrFetcher, {
    refreshInterval: 20000,
  });
  const [prc, setPrc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const verify = async (id: string) => {
    const license = (prc[id] || '').trim();
    if (!license) return;
    setBusy(id);
    try {
      await adminFetch('/admin/verify', { method: 'POST', body: { userId: id, prcLicense: license } });
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  const users = data?.users ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending professional verification</CardTitle>
        <CardDescription>
          Confirm the PRC license at{' '}
          <a
            className="text-primary underline-offset-2 hover:underline"
            href="https://verification.prc.gov.ph/"
            target="_blank"
            rel="noreferrer"
          >
            verification.prc.gov.ph
          </a>
          , then record the number to approve.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing pending 🎉</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>PRC License No.</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.firstName} {u.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={prc[u.id] || ''}
                      onChange={(e) => setPrc((p) => ({ ...p, [u.id]: e.target.value }))}
                      placeholder="e.g. 0123456"
                      className="h-9 w-36"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" disabled={busy === u.id || !(prc[u.id] || '').trim()} onClick={() => verify(u.id)}>
                      <CheckCircle2 className="h-4 w-4" />
                      Verify
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
