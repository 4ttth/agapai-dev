'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react';

import { adminFetch, swrFetcher, type UsersPage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PAGE_SIZE = 10;
const PRO_ROLES = ['DOCTOR', 'PHARMACIST'];

function roleBadge(role: string) {
  if (role === 'DOCTOR') return <Badge>DOCTOR</Badge>;
  if (role === 'PHARMACIST') return <Badge variant="secondary">PHARMACIST</Badge>;
  return <Badge variant="outline">PATIENT</Badge>;
}

export function UsersTable() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  // Confirmations / edits target a single user at a time.
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editRole, setEditRole] = useState<{ id: string; name: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q.trim()) params.set('q', q.trim());
  if (roleFilter !== 'ALL') params.set('role', roleFilter);

  const { data, isLoading, mutate } = useSWR<UsersPage>(`/admin/users?${params.toString()}`, swrFetcher, {
    refreshInterval: 15000,
    keepPreviousData: true,
  });

  const doDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await adminFetch(`/admin/users/${toDelete.id}`, { method: 'DELETE' });
      setToDelete(null);
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  const doEditRole = async (nextRole: string) => {
    if (!editRole) return;
    setBusy(true);
    try {
      await adminFetch(`/admin/users/${editRole.id}/role`, { method: 'PATCH', body: { role: nextRole } });
      setEditRole(null);
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  const users = data?.users ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>Users</CardTitle>
          <CardDescription>
            {data ? `${data.total} total` : 'Loading…'} · admin actions apply to doctors &amp; pharmacists
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or PRC…"
              className="h-9 w-48 pl-8"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All roles</SelectItem>
              <SelectItem value="PATIENT">Patients</SelectItem>
              <SelectItem value="DOCTOR">Doctors</SelectItem>
              <SelectItem value="PHARMACIST">Pharmacists</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>PRC No.</TableHead>
              <TableHead>eVerified</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && users.length === 0
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : users.map((u) => {
                  const isPro = PRO_ROLES.includes(u.role);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.firstName} {u.lastName}
                      </TableCell>
                      <TableCell>{roleBadge(u.role)}</TableCell>
                      <TableCell>
                        {u.verified ? (
                          <Badge variant="success">Verified</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.prcLicense || '—'}</TableCell>
                      <TableCell>{u.everified ? '✅' : '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {isPro ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit role"
                              onClick={() => setEditRole({ id: u.id, name: `${u.firstName} ${u.lastName}`, role: u.role })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Delete account"
                              onClick={() => setToDelete({ id: u.id, name: `${u.firstName} ${u.lastName}` })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            {!isLoading && users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No users match your filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data?.page ?? page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the professional account. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit role */}
      <Dialog open={!!editRole} onOpenChange={(o) => !o && setEditRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role — {editRole?.name}</DialogTitle>
            <DialogDescription>Switch this professional between doctor and pharmacist.</DialogDescription>
          </DialogHeader>
          <Select value={editRole?.role} onValueChange={(v) => setEditRole((e) => (e ? { ...e, role: v } : e))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DOCTOR">Doctor</SelectItem>
              <SelectItem value="PHARMACIST">Pharmacist</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRole(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => editRole && doEditRole(editRole.role)} disabled={busy}>
              {busy ? 'Saving…' : 'Save role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
