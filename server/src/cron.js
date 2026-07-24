import cron from 'node-cron';

import { prisma } from './db.js';
import { sendSms } from './egov.js';
import {
  apnsEnabled,
  contentState,
  endActivity,
  startActivity,
} from './liveActivity.js';

const TZ = 'Asia/Manila';
/** Manila is a fixed UTC+8 (no DST). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

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

/** Absolute epoch seconds for a Manila wall-clock (date "YYYY-MM-DD", h, m). */
function manilaEpochSeconds(date, h, m) {
  const [y, mo, d] = date.split('-').map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, m, 0) - MANILA_OFFSET_MS;
  return Math.floor(utcMs / 1000);
}

/**
 * Minute-accurate medication Live Activity sweep (iOS). For every patient with a
 * push-to-start token and active medications, this drives two push-to-start
 * pop-ups per dose — both work with the app fully closed:
 *
 *  - "pre":  exactly 5 minutes before the dose, a countdown nudge with an
 *            "Okay" button.
 *  - "due":  at the exact dose minute, a fresh 5-minute check-in with an
 *            "I already took it" button.
 *
 * A LiveActivitySession row dedupes each pop-up (one per patient/med/dose/day/
 * kind). Expired pop-ups are ended best-effort via their per-activity update
 * token if the app reported one while running; otherwise the stale-date lets the
 * system retire them on its own.
 */
export async function runLiveActivitySweep() {
  if (!apnsEnabled()) return;
  const { date, minutes: nowMin } = manilaNow();
  const nowEpoch = Math.floor(Date.now() / 1000);

  const meds = await prisma.medication.findMany({
    where: { active: true },
    include: {
      patient: { select: { id: true, role: true, firstName: true, liveActivityToken: true } },
    },
  });

  // Flatten to individual dose times for patients able to receive activities.
  const doses = [];
  for (const m of meds) {
    if (m.patient.role !== 'PATIENT' || !m.patient.liveActivityToken) continue;
    for (const t of JSON.parse(m.times || '[]')) {
      const [h, mi] = String(t).split(':').map(Number);
      if (Number.isNaN(h)) continue;
      doses.push({
        patient: m.patient,
        medicationId: m.id,
        name: m.name,
        dosage: m.dosage || '',
        h,
        m: mi || 0,
        at: h * 60 + (mi || 0),
      });
    }
  }

  for (const d of doses) {
    const lead = d.at - nowMin;
    const kind = lead === 5 ? 'pre' : lead === 0 ? 'due' : null;
    if (!kind) continue;

    const doseMinutes = d.at;
    const dupWhere = {
      patientId_medicationId_doseDate_doseMinutes_kind: {
        patientId: d.patient.id,
        medicationId: d.medicationId,
        doseDate: date,
        doseMinutes,
        kind,
      },
    };
    const existing = await prisma.liveActivitySession.findUnique({ where: dupWhere });
    if (existing) continue;

    const doseEpoch = manilaEpochSeconds(date, d.h, d.m);
    const scheduledAtISO = new Date(doseEpoch * 1000).toISOString();
    const label = d.dosage ? `${d.dosage} ${d.name}` : d.name;
    const attributes = {
      medicationId: d.medicationId,
      medicationName: d.name,
      dosage: d.dosage,
      scheduledAtISO,
    };

    let state;
    let alert;
    if (kind === 'pre') {
      // Countdown to the dose time; "Okay" acknowledges.
      state = contentState({ phase: 'upcoming', deadlineEpoch: doseEpoch });
      alert = { title: 'Medication in 5 minutes', body: `Get ready to take ${label}.` };
    } else {
      // Fresh 5-minute window to confirm; "I already took it" logs it.
      state = contentState({ phase: 'due', deadlineEpoch: nowEpoch + 300 });
      alert = { title: `Time to take ${d.name}`, body: 'Tap "I already took it" once you have.' };
    }

    const r = await startActivity(d.patient.liveActivityToken, attributes, state, alert);
    if (r.ok) {
      await prisma.liveActivitySession.create({
        data: {
          patientId: d.patient.id,
          medicationId: d.medicationId,
          kind,
          doseDate: date,
          doseMinutes,
          scheduledAtISO,
          phase: kind === 'pre' ? 'upcoming' : 'due',
        },
      });
      console.log(`[live-activity] ${kind} started for ${d.patient.id} — ${d.name}`);
    }
  }

  // Retire pop-ups whose window has passed (best-effort end via update token).
  const stale = await prisma.liveActivitySession.findMany({
    where: { doseDate: date, phase: { not: 'ended' } },
  });
  for (const s of stale) {
    const endAfter = s.doseMinutes + (s.kind === 'due' ? 6 : 6);
    if (!s.taken && nowMin <= endAfter) continue;
    if (s.updateToken) {
      const finalState = contentState({
        phase: s.kind === 'due' ? 'due' : 'upcoming',
        taken: s.taken,
        deadlineEpoch: nowEpoch,
      });
      await endActivity(s.updateToken, finalState);
    }
    await prisma.liveActivitySession.update({
      where: { id: s.id },
      data: { phase: 'ended', endedAt: new Date() },
    });
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

export function startCron() {
  cron.schedule('*/5 * * * *', () => runSmsSweep().catch((e) => console.error('[sms] sweep error', e)));
  cron.schedule('7 * * * *', () =>
    purgeExpiredFollowUps().catch((e) => console.error('[follow-up] purge error', e)),
  );
  console.log('[cron] SMS reminder sweep scheduled every 5 minutes');
  console.log('[cron] follow-up retention purge scheduled hourly');
  if (apnsEnabled()) {
    // Minute-accurate so the "5 minutes before" and "exact dose time" pop-ups
    // land on time.
    cron.schedule('* * * * *', () =>
      runLiveActivitySweep().catch((e) => console.error('[live-activity] sweep error', e)),
    );
    console.log('[cron] medication Live Activity sweep scheduled every minute');
  }
}
