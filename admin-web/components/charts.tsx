'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { Overview } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const ROLE_COLORS = ['#2563eb', '#0f6e6e', '#9333ea'];

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
    color: 'hsl(var(--popover-foreground))',
  },
};

export function Charts({ data }: { data?: Overview }) {
  if (!data) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>API traffic</CardTitle>
          <CardDescription>Requests per hour over the last 24 hours</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.charts.hourly} margin={{ left: -20, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={3} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="requests" stroke="#2563eb" strokeWidth={2} fill="url(#reqFill)" />
              <Area type="monotone" dataKey="errors" stroke="#dc2626" strokeWidth={1.5} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User mix</CardTitle>
          <CardDescription>Accounts by role</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data.charts.roles}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={3}
              >
                {data.charts.roles.map((_, i) => (
                  <Cell key={i} fill={ROLE_COLORS[i % ROLE_COLORS.length]} />
                ))}
              </Pie>
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>New sign-ups</CardTitle>
          <CardDescription>Patients vs professionals over the last 14 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.daily} margin={{ left: -20, right: 8, top: 4 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(d: string) => d.slice(5)}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
              <Tooltip {...tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="patients" stackId="a" fill="#2563eb" radius={[0, 0, 0, 0]} />
              <Bar dataKey="professionals" stackId="a" fill="#0f6e6e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
