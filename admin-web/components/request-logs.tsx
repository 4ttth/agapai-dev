'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

import {
  adminFetch,
  swrFetcher,
  type RequestLogDetail,
  type RequestLogRow,
  type RequestLogsPage,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

function methodBadge(method: string) {
  const variants: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-yellow-100 text-yellow-700',
    PATCH: 'bg-orange-100 text-orange-700',
    DELETE: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold font-mono ${variants[method] ?? 'bg-muted text-muted-foreground'}`}
    >
      {method}
    </span>
  );
}

function statusBadge(status: number) {
  const cls =
    status < 300
      ? 'bg-green-100 text-green-700'
      : status < 400
        ? 'bg-blue-100 text-blue-700'
        : status < 500
          ? 'bg-yellow-100 text-yellow-700'
          : 'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold font-mono ${cls}`}>
      {status}
    </span>
  );
}

function msBadge(ms: number) {
  const cls = ms < 300 ? 'text-green-600' : ms < 1000 ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-mono text-xs ${cls}`}>{ms} ms</span>;
}

function formatTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Pretty-print a JSON string; fall back to raw string on parse error. */
function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ logId, onClose }: { logId: string; onClose: () => void }) {
  const { data, isLoading } = useSWR<{ log: RequestLogDetail }>(
    `/admin/request-logs/${logId}`,
    swrFetcher,
  );

  const log = data?.log;

  const sections: { label: string; content: string }[] = log
    ? [
        { label: 'Request Headers', content: prettyJson(log.reqHeaders) },
        { label: 'Request Body', content: prettyJson(log.reqBody) },
        { label: 'Response Body', content: prettyJson(log.resBody) },
      ]
    : [];

  return (
    <div className="border-t bg-muted/40">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Request Detail
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : log ? (
        <div className="grid gap-0 divide-y">
          {/* Meta row */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2 text-xs text-muted-foreground">
            <span><span className="font-medium text-foreground">Full path:</span> {log.fullPath}</span>
            <span><span className="font-medium text-foreground">IP:</span> {log.ip ?? '—'}</span>
            <span><span className="font-medium text-foreground">Time:</span> {formatTs(log.at)}</span>
            <span><span className="font-medium text-foreground">Duration:</span> {log.ms} ms</span>
          </div>

          {sections.map(({ label, content }) => (
            <SectionBlock key={label} label={label} content={content} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">Failed to load detail.</p>
      )}
    </div>
  );
}

function SectionBlock({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(true);
  const isEmpty = !content || content === '{}' || content === 'null';

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
      >
        <span className="uppercase tracking-wide text-muted-foreground">{label}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-3">
          {isEmpty ? (
            <span className="text-xs text-muted-foreground italic">empty</span>
          ) : (
            <pre className="overflow-x-auto rounded border bg-background p-3 text-[11px] leading-relaxed font-mono text-foreground max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RequestLogs() {
  const [page, setPage] = useState(1);
  const [route, setRoute] = useState('');
  const [method, setMethod] = useState('ALL');
  const [statusClass, setStatusClass] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (route.trim()) params.set('route', route.trim());
  if (method !== 'ALL') params.set('method', method);
  if (statusClass !== 'ALL') params.set('statusClass', statusClass);

  const { data, isLoading, mutate, isValidating } = useSWR<RequestLogsPage>(
    `/admin/request-logs?${params.toString()}`,
    swrFetcher,
    { refreshInterval: 10000, keepPreviousData: true },
  );

  const reset = useCallback(() => {
    setPage(1);
    setRoute('');
    setMethod('ALL');
    setStatusClass('ALL');
    setExpandedId(null);
  }, []);

  const logs = data?.logs ?? [];
  const totalPages = data?.totalPages ?? 1;
  const hasFilters = route.trim() || method !== 'ALL' || statusClass !== 'ALL';

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>API Request Logs</CardTitle>
          <CardDescription>
            {data ? `${data.total.toLocaleString()} total entries` : 'Loading…'} · last 7 days ·
            10 s auto-refresh
          </CardDescription>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Route search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={route}
              onChange={(e) => { setRoute(e.target.value); setPage(1); setExpandedId(null); }}
              placeholder="Filter route…"
              className="h-9 w-44 pl-8 font-mono text-xs"
            />
          </div>

          {/* Method filter */}
          <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); setExpandedId(null); }}>
            <SelectTrigger className="h-9 w-28">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All methods</SelectItem>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>

          {/* Status class filter */}
          <Select value={statusClass} onValueChange={(v) => { setStatusClass(v); setPage(1); setExpandedId(null); }}>
            <SelectTrigger className="h-9 w-28">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="2xx">2xx Success</SelectItem>
              <SelectItem value="3xx">3xx Redirect</SelectItem>
              <SelectItem value="4xx">4xx Client err</SelectItem>
              <SelectItem value="5xx">5xx Server err</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-9 px-2 text-muted-foreground">
              <X className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isValidating}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <span>No requests logged yet.</span>
            {hasFilters && (
              <Button variant="link" size="sm" onClick={reset}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Method</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[90px]">Duration</TableHead>
                  <TableHead className="w-[120px] hidden md:table-cell">IP</TableHead>
                  <TableHead className="w-[160px] hidden sm:table-cell">Time</TableHead>
                  <TableHead className="w-[48px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <>
                    <TableRow
                      key={log.id}
                      className={`cursor-pointer transition-colors ${expandedId === log.id ? 'bg-muted/60' : 'hover:bg-muted/40'}`}
                      onClick={() => toggleExpand(log.id)}
                    >
                      <TableCell>{methodBadge(log.method)}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[260px] truncate" title={log.fullPath}>
                        {log.route}
                      </TableCell>
                      <TableCell>{statusBadge(log.status)}</TableCell>
                      <TableCell>{msBadge(log.ms)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground hidden md:table-cell">
                        {log.ip ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                        {formatTs(log.at)}
                      </TableCell>
                      <TableCell className="pr-3 text-right">
                        {expandedId === log.id
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                    </TableRow>

                    {expandedId === log.id && (
                      <TableRow key={`${log.id}-detail`} className="hover:bg-transparent">
                        <TableCell colSpan={7} className="p-0">
                          <DetailPanel logId={log.id} onClose={() => setExpandedId(null)} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Page {data?.page ?? 1} of {totalPages} · {data?.total.toLocaleString()} entries
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
