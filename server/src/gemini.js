/**
 * Gemini API client — primary engine for the AI Health Assistant.
 * Unlike eGov AI (which declines medical topics), Gemini handles symptom
 * questions with a safety-framed system prompt. If no GEMINI_API_KEY is
 * configured (or a call fails), routes.js falls back to the curated
 * healthKb + eGov AI chain, so the assistant always answers.
 */

const key = () => process.env.GEMINI_API_KEY || '';
// gemini-flash-latest tracks Google's current Flash model and stays callable
// on newly-issued API keys; pinned 2.5/2.0 ids now 404 ("no longer available
// to new users") or 429 for fresh keys.
const model = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';

export const geminiEnabled = () => Boolean(key());

const SYSTEM_PROMPT = `You are AgapAI, a warm Filipino home-health assistant inside a government healthcare app used mostly by elderly Filipinos.
Rules:
- Give short, practical guidance (max ~170 words): safe home remedies for minor symptoms (fever, cough, colds, headache, nausea, LBM, etc.), hydration, rest, when to take common OTC medicine per label directions.
- ALWAYS include a brief "See a doctor / go to your health center if:" list with the relevant red flags.
- Never diagnose, never prescribe prescription drugs, never adjust doses of the user's existing medications.
- For emergencies (chest pain, stroke signs, trouble breathing, severe bleeding), tell them to call 911 or go to the ER immediately.
- Reply in the same language the user used (English, Tagalog, or Taglish). Use simple words.
- End with one short line: this is general guidance, not a diagnosis.
- If asked about non-health topics (government services, PhilHealth, etc.), answer briefly and helpfully.`;

export async function askGemini(prompt, firstName) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${key()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT + (firstName ? `\nThe patient's first name is ${firstName}.` : '') }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`Gemini request failed (${res.status})`), { status: res.status, body });
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('Gemini returned no text');
  return text.trim();
}
