/**
 * Curated home-remedy knowledge layer. The eGov AI assistant is scoped to
 * government-services topics and declines medical questions, so symptom
 * questions are answered from this reviewed knowledge base instead, and
 * everything else passes through to eGov AI.
 */

const DISCLAIMER =
  'This is general wellness guidance only, not a diagnosis. If symptoms are severe or you are worried, please visit your barangay health center or doctor.';

const TOPICS = [
  {
    id: 'fever',
    keywords: ['fever', 'lagnat', 'temperature', 'nilalagnat'],
    title: 'Fever (Lagnat)',
    remedies: [
      'Rest and drink plenty of water or oral rehydration solution.',
      'Take a lukewarm sponge bath — avoid ice-cold water.',
      'Paracetamol may help (follow the label dose); avoid doubling up with other paracetamol-containing meds.',
      'Wear light clothing and keep the room ventilated.',
    ],
    redFlags: [
      'Fever above 39.5°C or lasting more than 3 days',
      'Stiff neck, rash, seizures, or trouble breathing',
      'Fever in an infant under 3 months',
    ],
  },
  {
    id: 'headache',
    keywords: ['headache', 'sakit ng ulo', 'migraine', 'masakit ang ulo', 'head hurts'],
    title: 'Headache',
    remedies: [
      'Rest in a quiet, dim room and close your eyes for 15–30 minutes.',
      'Drink water — dehydration is a very common cause.',
      'Apply a cold or warm compress to the forehead or neck.',
      'Limit screen time and try gentle neck stretches.',
    ],
    redFlags: [
      '"Worst headache of your life", or one that starts suddenly like a thunderclap',
      'Headache with fever + stiff neck, confusion, or vision loss',
      'After a head injury',
    ],
  },
  {
    id: 'cold',
    keywords: ['cold', 'sipon', 'runny nose', 'clogged nose', 'baradong ilong', 'colds'],
    title: 'Common cold (Sipon)',
    remedies: [
      'Drink warm fluids — salabat (ginger tea), warm calamansi juice, or soup.',
      'Steam inhalation: breathe over a bowl of warm water for 5–10 minutes.',
      'Saline nasal drops help clear a clogged nose.',
      'Rest and get enough sleep so your body can recover.',
    ],
    redFlags: ['Symptoms beyond 10 days or getting worse', 'High fever, ear pain, or difficulty breathing'],
  },
  {
    id: 'cough',
    keywords: ['cough', 'ubo', 'inuubo', 'plema', 'phlegm'],
    title: 'Cough (Ubo)',
    remedies: [
      'Warm water with calamansi and honey soothes the throat (no honey for babies under 1).',
      'Salabat (ginger tea) 2–3× a day.',
      'Stay hydrated to loosen phlegm; avoid smoke and dust.',
      'Elevate your head while sleeping.',
    ],
    redFlags: [
      'Cough beyond 2–3 weeks (get checked for TB — free at health centers)',
      'Coughing up blood, chest pain, or shortness of breath',
    ],
  },
  {
    id: 'soreThroat',
    keywords: ['sore throat', 'masakit ang lalamunan', 'throat pain', 'namamagang lalamunan'],
    title: 'Sore throat',
    remedies: [
      'Gargle warm salt water (1/2 tsp salt in a glass) several times a day.',
      'Warm honey-calamansi drinks.',
      'Avoid very cold drinks, smoke, and shouting.',
    ],
    redFlags: ['Trouble swallowing or breathing', 'Lasts more than a week or with high fever'],
  },
  {
    id: 'nausea',
    keywords: ['nausea', 'nauseous', 'naduduwal', 'duwal', 'suka', 'vomit', 'nagsusuka'],
    title: 'Nausea / Vomiting',
    remedies: [
      'Sip small amounts of clear fluids or oral rehydration solution frequently.',
      'Ginger — salabat or ginger candy — helps settle the stomach.',
      'Eat small bland meals (lugaw, crackers, banana); avoid oily food.',
      'Rest sitting up; avoid lying flat right after eating.',
    ],
    redFlags: [
      'Signs of dehydration: very dark urine, dizziness, dry mouth',
      'Vomiting blood or persistent vomiting beyond 24 hours',
      'Severe abdominal pain',
    ],
  },
  {
    id: 'stomach',
    keywords: ['stomach', 'sakit ng tiyan', 'tummy', 'abdominal', 'masakit ang tiyan', 'hyperacidity', 'heartburn'],
    title: 'Stomach ache',
    remedies: [
      'Sip warm water or ginger tea; a warm compress on the belly can ease cramps.',
      'Eat light: lugaw, toast, banana. Avoid spicy, oily, and acidic food for now.',
      'For hyperacidity: eat on time and avoid coffee and soft drinks on an empty stomach.',
    ],
    redFlags: [
      'Severe pain, or pain that moves to the lower right side (possible appendicitis)',
      'Black or bloody stools',
      'Pain with fever and vomiting',
    ],
  },
  {
    id: 'diarrhea',
    keywords: ['diarrhea', 'lbm', 'iti', 'nagtatae', 'loose bowel'],
    title: 'Diarrhea (LBM)',
    remedies: [
      'Priority #1: oral rehydration solution (Oresol) or homemade: 1L clean water + 6 tsp sugar + 1/2 tsp salt.',
      'Keep eating small bland meals — lugaw, banana, crackers.',
      'Avoid milk, coffee, and very sweet drinks while recovering.',
    ],
    redFlags: ['Blood in stool, high fever, or signs of dehydration', 'More than 2 days in adults, sooner in kids/elderly'],
  },
  {
    id: 'dizzy',
    keywords: ['dizzy', 'dizziness', 'hilo', 'nahihilo', 'lightheaded', 'vertigo'],
    title: 'Dizziness (Hilo)',
    remedies: [
      'Sit or lie down right away to avoid falls; rise slowly from bed.',
      'Drink water — dehydration and skipped meals are common causes.',
      'If you have BP medication, check your blood pressure if possible.',
    ],
    redFlags: [
      'Dizziness with chest pain, slurred speech, one-sided weakness, or fainting — emergency, go to the ER',
      'Recurring vertigo spells',
    ],
  },
  {
    id: 'bodyPain',
    keywords: ['body pain', 'muscle pain', 'pananakit ng katawan', 'back pain', 'sakit ng likod', 'joint', 'rayuma'],
    title: 'Body / muscle pain',
    remedies: [
      'Warm compress or warm shower relaxes sore muscles.',
      'Gentle stretching; avoid lifting heavy objects for now.',
      'Rest, but light movement is better than lying down all day.',
    ],
    redFlags: ['Pain after a fall or accident', 'Numbness, weakness, or pain spreading down a leg/arm'],
  },
  {
    id: 'insomnia',
    keywords: ['sleep', 'insomnia', 'hindi makatulog', 'puyat', "can't sleep"],
    title: 'Trouble sleeping',
    remedies: [
      'Keep a fixed sleep and wake time, even on weekends.',
      'No coffee, tea, or cola after lunch; avoid heavy late dinners.',
      'Put screens away 1 hour before bed; keep the room dark and cool.',
      'Try slow breathing: inhale 4s, hold 4s, exhale 6s, repeat.',
    ],
    redFlags: ['Sleeplessness beyond 2 weeks affecting daily life', 'Loud snoring with breathing pauses'],
  },
  {
    id: 'rash',
    keywords: ['rash', 'pantal', 'itchy', 'makati', 'allergy', 'allergic', 'hives'],
    title: 'Skin rash / mild allergy',
    remedies: [
      'Wash the area with mild soap and water; pat dry.',
      'Cold compress eases itching — avoid scratching.',
      'Note any new food, soap, or medicine that may have triggered it and avoid it.',
    ],
    redFlags: [
      'Swelling of lips/face, difficulty breathing — EMERGENCY (severe allergic reaction), go to ER now',
      'Rash with fever, or spreading fast',
    ],
  },
  {
    id: 'burn',
    keywords: ['burn', 'paso', 'napaso', 'scald'],
    title: 'Minor burn (Paso)',
    remedies: [
      'Run cool (not ice-cold) water over it for 10–20 minutes.',
      'Do NOT apply toothpaste, butter, or ice.',
      'Cover loosely with a clean, non-stick cloth.',
    ],
    redFlags: ['Burns on the face, hands, or joints, or larger than your palm', 'Blisters that look deep or infected'],
  },
  {
    id: 'wound',
    keywords: ['wound', 'cut', 'sugat', 'nahiwa', 'bleeding'],
    title: 'Minor cut / wound',
    remedies: [
      'Press with a clean cloth until bleeding stops.',
      'Wash with clean running water and mild soap; cover with a sterile bandage.',
      'Watch for redness, swelling, or pus in the next days.',
    ],
    redFlags: ['Deep or gaping wounds (may need stitches)', 'Caused by rusty metal or animal bite — ask about tetanus/anti-rabies at the health center'],
  },
];

export function matchHealthTopic(prompt) {
  const p = ` ${prompt.toLowerCase()} `;
  let best = null;
  let bestScore = 0;
  for (const t of TOPICS) {
    const score = t.keywords.reduce((n, k) => (p.includes(k.toLowerCase()) ? n + 1 : n), 0);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

export function buildHealthReply(topic, firstName) {
  const hi = firstName ? `Hi ${firstName}! ` : '';
  return (
    `${hi}Here's what usually helps for ${topic.title.toLowerCase()}:\n\n` +
    topic.remedies.map((r) => `• ${r}`).join('\n') +
    `\n\nGo to a doctor or health center if:\n` +
    topic.redFlags.map((r) => `⚠ ${r}`).join('\n') +
    `\n\n${DISCLAIMER}`
  );
}

export function genericHealthReply(firstName) {
  const hi = firstName ? `Hi ${firstName}! ` : '';
  return (
    `${hi}I couldn't match that to a specific remedy guide, but here are safe general steps: rest, drink plenty of water, eat light meals, and monitor how you feel today. ` +
    `If you can, take your temperature and blood pressure and note your symptoms in the app so you can show your doctor.\n\n${DISCLAIMER}`
  );
}

/** Heuristic: does the question look like a health/symptom question? */
export function looksHealthRelated(prompt) {
  const p = prompt.toLowerCase();
  const hints = [
    'sakit', 'masakit', 'pain', 'hurt', 'sick', 'unwell', 'symptom', 'remedy', 'remedies', 'gamot',
    'medicine', 'ubo', 'sipon', 'lagnat', 'fever', 'hilo', 'duwal', 'sugat', 'health', 'feel',
  ];
  return hints.some((h) => p.includes(h));
}

/** Does an eGov AI reply look like its standard "not my scope" refusal? */
export function looksLikeRefusal(reply) {
  const r = (reply || '').toLowerCase();
  return (
    r.includes('health ai service') ||
    (r.includes('egovph ai assistant') && (r.includes('cannot') || r.includes('government-related'))) ||
    r.includes('sumangguni sa isang health ai')
  );
}
