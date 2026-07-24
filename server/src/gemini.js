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

// Neural TTS. The dedicated *-tts model returns spoken audio (24 kHz PCM) that
// sounds far more human than a device speech synthesizer. Voice is a Gemini
// prebuilt voice name; "Sulafat" is warm and friendly, which suits the
// elderly-first assistant.
const ttsModel = () => process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const ttsVoice = () => process.env.GEMINI_TTS_VOICE || 'Sulafat';

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
      `PRONOUNS — STRICT: the patient uses ${pronouns}. Use exactly these pronouns for the patient everywhere, including in your own reasoning, summaries and any transcript. Never substitute he/him or she/her, and never infer pronouns from the patient's name, gender or voice. If you would otherwise write a gendered pronoun for the patient, write ${pronouns} instead. Do not mention or comment on their pronouns.`,
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
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 2048,
          // Turn thinking OFF. flash/flash-lite "-latest" can roll onto a
          // thinking model that spends its whole output budget on thought
          // tokens and returns an EMPTY answer — which the app shows as "the
          // assistant isn't responding". A 0 budget keeps replies fast and
          // guarantees the tokens go to the actual answer. (Ignored by models
          // that don't think, so it's safe across the "-latest" aliases.)
          thinkingConfig: { thinkingBudget: 0 },
        },
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

/**
 * The strict, closed set of visual medicine categories. Kept small on purpose:
 * these eight cover ~99% of medications and each maps to one clear icon.
 */
export const MEDICATION_CATEGORIES = [
  'pill',
  'capsule',
  'liquid',
  'inhaler',
  'injection',
  'drops',
  'cream',
  'other',
];

/**
 * Classify a medicine name into one MEDICATION_CATEGORIES value using Gemini's
 * Structured Output (JSON mode) — the model is forced to answer with a single
 * value from the enum, so we always get a clean, predictable category string
 * (never conversational text). Throws if Gemini is unavailable; callers fall
 * back to the keyword heuristic.
 */
export async function classifyMedicationCategory(name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('No medicine name to classify');
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
                'You classify a medicine by its physical dosage form. Reply with the single best-fitting category. ' +
                'Use "pill" for tablets, "capsule" for capsules/softgels, "liquid" for syrups/suspensions/oral solutions, ' +
                '"inhaler" for inhalers/nebules/puffs, "injection" for injectables/vials/ampoules, "drops" for eye/ear/nasal drops, ' +
                '"cream" for creams/ointments/gels/topicals, and "other" only when none fit.',
            },
          ],
        },
        contents: [{ role: 'user', parts: [{ text: `Medicine: ${clean.slice(0, 120)}` }] }],
        generationConfig: {
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: { category: { type: 'string', enum: MEDICATION_CATEGORIES } },
            required: ['category'],
          },
        },
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`Gemini classify failed (${res.status})`), { status: res.status, body });
  }
  const raw = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let category;
  try {
    category = JSON.parse(raw)?.category;
  } catch {
    category = null;
  }
  if (!MEDICATION_CATEGORIES.includes(category)) throw new Error('Gemini returned an invalid category');
  return category;
}

/**
 * Synthesize speech with Gemini's neural TTS. Returns { audio, mimeType, rate }
 * where `audio` is base64 signed-16-bit little-endian PCM (mono). The caller
 * plays it directly (react-native-audio-api decodes raw PCM), so no container
 * is needed.
 */
export async function synthesizeSpeech(text, { voice } = {}) {
  const clean = String(text ?? '').trim();
  if (!clean) throw new Error('No text to speak');

  const modelsToTry = Array.from(new Set([ttsModel(), 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash', 'gemini-2.0-flash']));
  let lastErr = null;

  for (const targetModel of modelsToTry) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${key()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Cap length so a very long record can't blow the TTS request timeout.
            contents: [{ parts: [{ text: clean.slice(0, 2000) }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || ttsVoice() } },
              },
            },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(`Gemini TTS failed with ${targetModel} (${res.status})`), { status: res.status, body });
      }
      const part = body?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
      const data = part?.inlineData?.data;
      if (!data) throw new Error(`Gemini TTS returned no audio with ${targetModel}`);
      const mimeType = part.inlineData.mimeType || 'audio/pcm;rate=24000';
      const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1]) || 24000;
      return { audio: data, mimeType, rate };
    } catch (err) {
      lastErr = err;
      if (err.status === 404 || err.status === 400) {
        console.warn(`[tts] ${targetModel} failed (${err.status}), trying candidate model...`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
