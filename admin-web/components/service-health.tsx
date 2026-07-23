'use client';

import type { Overview } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const LABELS: Record<string, string> = {
  sso: 'eGov SSO',
  everify: 'eVerify',
  emessage: 'eMessage',
  egovai: 'eGov AI',
  faceliveness: 'Face Liveness',
};

function credits(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, any>;
  const n = o.credits_remaining ?? o.data?.credits_remaining ?? o.credits ?? null;
  return n == null ? null : String(n);
}

export function ServiceHealth({ data }: { data?: Overview }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">eGov service health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {!data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-28 rounded-full" />)
        ) : (
          <>
            {Object.entries(data.services).map(([name, s]) => (
              <Badge key={name} variant={s.reachable ? 'success' : 'destructive'} className="gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${s.reachable ? 'bg-white' : 'bg-white/80'}`} />
                {LABELS[name] ?? name.toUpperCase()} · {s.reachable ? `${s.ms}ms` : 'DOWN'}
              </Badge>
            ))}
            <Badge variant="success" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Database · UP
            </Badge>
            {credits(data.aiCredits) ? (
              <Badge variant="secondary">eGov AI credits · {credits(data.aiCredits)}</Badge>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
