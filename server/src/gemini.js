/**
 * Gemini API client — primary engine for the AI Health Assistant.
 * Unlike eGov AI (which declines medical topics), Gemini handles symptom
 * questions with a safety-framed system prompt. If no GEMINI_API_KEY is
 * configured (or a call fails), routes.js falls back to the curated
 * healthKb + eGov AI chain, so the assistant always answers.
 */

const key = () => process.env.GEMINI_API_KEY || '';
// The "-latest" aliases stay callable on newly-issued API keys; pinned 2.5/2.0
// ids now 404 ("no longer available to new users") or 429 for fresh keys.
// flash-lite over flash deliberately: flash-latest is a *thinking* model that
// spends ~600 thought tokens and ~47s per reply (blowing the request timeout
// and truncating the answer), while flash-lite answers in ~1.7s with no
// thinking and comparable output for this assistant's short-guidance use case.
const model = () => process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

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

/**
 * Address the patient the way they told us to at registration. Pronouns are
 * free-form, so they are passed through verbatim rather than mapped to a set.
 */
export function personaLines({ firstName, pronouns, gender } = {}) {
  const bits = [];
  if (firstName) bits.push(`The patient's first name is ${firstName}.`);
  if (pronouns) {
    bits.push(
      `The patient's pronouns are ${pronouns} — always use them when referring to the patient in the third person. Never guess or substitute different pronouns, and never comment on their pronouns.`,
    );
  }
  if (gender) bits.push(`The patient's gender is ${gender}; use it only where it is clinically relevant.`);
  return bits.length ? `\n${bits.join('\n')}` : '';
}

/** Extracted document text the patient uploaded, for the model to interpret. */
export function documentLines(documentText) {
  const t = String(documentText ?? '').trim();
  if (!t) return '';
  return (
    `\n\nThe patient uploaded a document. Text extracted from it by eGov AI is between the markers.` +
    ` Explain it in plain language and relate it to their question; if the text is unclear or looks incomplete, say so rather than guessing.\n` +
    `--- BEGIN DOCUMENT ---\n${t.slice(0, 12000)}\n--- END DOCUMENT ---`
  );
}

export async function askGemini(prompt, firstName, opts = {}) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${key()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                SYSTEM_PROMPT +
                personaLines({ firstName, pronouns: opts.pronouns, gender: opts.gender }) +
                documentLines(opts.documentText),
            },
          ],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Headroom so a thinking model's thought tokens can't truncate the
        // answer (that shows up as a reply cut off mid-reasoning).
        generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45000),
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
