import cron from 'node-cron';

import { prisma } from './db.js';
import { sendSms } from './egov.js';

const TZ = 'Asia/Manila';

function manilaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

const fmt = (m) => {
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(min).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

/**
 * Every 5 minutes: for each patient, find today's earliest remaining dose time.
 * If it is 55–65 minutes away, send ONE SMS for the day (deduped) listing the
 * first two medications of the day, per the eMessage reminder spec.
 */
export async function runSmsSweep() {
  if (process.env.SMS_ENABLED !== 'true') return;
  const { date, minutes: nowMin } = manilaNow();
  const meds = await prisma.medication.findMany({
    where: { active: true },
    include: { patient: { select: { id: true, role: true, mobile: true, mobile2: true, firstName: true } } },
  });

  const byPatient = new Map();
  for (const m of meds) {
    if (m.patient.role !== 'PATIENT' || !m.patient.mobile) continue;
    const times = JSON.parse(m.times || '[]');
    for (const t of times) {
      const [h, min] = t.split(':').map(Number);
      if (Number.isNaN(h)) continue;
      const at = h * 60 + (min || 0);
      const list = byPatient.get(m.patient.id) || { patient: m.patient, doses: [] };
      list.doses.push({ name: m.name, dosage: m.dosage, at });
      byPatient.set(m.patient.id, list);
    }
  }

  for (const { patient, doses } of byPatient.values()) {
    doses.sort((a, b) => a.at - b.at);
    const earliest = doses[0];
    const lead = earliest.at - nowMin;
    if (lead < 55 || lead > 65) continue;
    const dedupeKey = `${patient.id}:${date}`;
    const dup = await prisma.smsLog.findUnique({ where: { dedupeKey } });
    if (dup) continue;
    const firstTwo = doses.slice(0, 2).map((d) => `${d.name}${d.dosage ? ` (${d.dosage})` : ''} at ${fmt(d.at)}`);
    const message =
      `AgapAI: Hi ${patient.firstName}! Medication reminder — ${firstTwo.join(', ')}. ` +
      `Open the AgapAI app to see your remaining medications for today.`;
    // Reminders go to the primary number AND the optional secondary number.
    const numbers = [patient.mobile, patient.mobile2].filter(
      (n, i, arr) => n && arr.indexOf(n) === i,
    );
    const results = await Promise.all(numbers.map((n) => sendSms(n, message)));
    const anyOk = results.some((r) => r.ok);
    const status = anyOk
      ? results.every((r) => r.ok)
        ? 'sent'
        : 'partial'
      : `failed:${results[0]?.status ?? 'none'}`;
    await prisma.smsLog.create({
      data: { patientId: patient.id, dedupeKey, message, status },
    });
    console.log(`[sms] ${numbers.join(', ')} → ${status}`);
  }
}

/**
 * Purge expired follow-up threads. Each thread lives at most 7 days (see the
 * FollowUpThread model); deleting it cascades to its messages and shares, so a
 * follow-up never costs more than a week of storage. Runs hourly.
 */
export async function purgeExpiredFollowUps() {
  const { count } = await prisma.followUpThread.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (count > 0) console.log(`[follow-up] purged ${count} expired thread(s)`);
}

/**
 * Prune request logs older than 7 days so the table stays lean.
 * Runs nightly alongside follow-up cleanup.
 */
export async function pruneRequestLogs() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.requestLog.deleteMany({ where: { at: { lt: cutoff } } });
  if (count > 0) console.log(`[request-log] pruned ${count} old log(s)`);
}

export function startCron() {
  cron.schedule('*/5 * * * *', () => runSmsSweep().catch((e) => console.error('[sms] sweep error', e)));
  cron.schedule('7 * * * *', () =>
    purgeExpiredFollowUps().catch((e) => console.error('[follow-up] purge error', e)),
  );
  cron.schedule('17 3 * * *', () =>
    pruneRequestLogs().catch((e) => console.error('[request-log] prune error', e)),
  );
  console.log('[cron] SMS reminder sweep scheduled every 5 minutes');
  console.log('[cron] follow-up retention purge scheduled hourly');
  console.log('[cron] request-log prune scheduled nightly at 03:17');
}
