'use client';

import { Activity, ClipboardList, Gauge, MessageSquare, Stethoscope, UserRound, Users } from 'lucide-react';

import type { Overview } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const ICONS = {
  patients: UserRound,
  professionals: Stethoscope,
  pending: ClipboardList,
  consultations: Activity,
  sms: MessageSquare,
  traffic: Gauge,
  latency: Users,
} as const;

function Stat({
  label,
  value,
  Icon,
  accent,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${accent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCards({ data }: { data?: Overview }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px]" />
        ))}
      </div>
    );
  }
  const c = data.counts;
  const professionals = c.doctors + c.pharmacists;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Patients" value={c.patients} Icon={ICONS.patients} accent />
      <Stat label="Professionals" value={professionals} Icon={ICONS.professionals} />
      <Stat label="Pending verification" value={c.pending} Icon={ICONS.pending} />
      <Stat label="Consultations" value={c.consultations} Icon={ICONS.consultations} />
      <Stat label="SMS sent" value={c.sms} Icon={ICONS.sms} />
      <Stat label="Avg latency" value={`${data.traffic.avgMs}ms`} Icon={ICONS.traffic} />
    </div>
  );
}
