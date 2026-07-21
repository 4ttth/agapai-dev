import { InfoPage } from '@/components/InfoPage';

export default function GuideScreen() {
  return (
    <InfoPage
      intro="Everything in AgapAI is 3 taps away. Here's the quick tour."
      sections={[
        {
          heading: '🏠 Home',
          body: 'Your day at a glance: medicines due next, your mood calendar, recent consultations, and medicines from the pharmacy. Tap your avatar or the Health ID chip to show your QR.',
        },
        {
          heading: '⊞ The center button',
          body: 'The round button in the middle of the bottom bar opens quick actions: scan a document, show your Health ID, open consultations, medications, or the AI assistant.',
        },
        {
          heading: '💊 Meds',
          body: 'Add each medicine with its schedule. AgapAI reminds you on time (phone notification), and one SMS text arrives one hour before your first medicine of the day.',
        },
        {
          heading: '🗂 Records',
          body: 'Consultations uploaded by your doctor appear here, end-to-end encrypted — only your phone can open them. "My documents" holds photos of lab results and prescriptions, saved offline only.',
        },
        {
          heading: '🩺 At the clinic',
          body: 'Show your Health ID QR. Your doctor scans it to see your allergies and conditions, and to upload the consultation and prescriptions securely.',
        },
        {
          heading: '💬 AI Assistant',
          body: 'Tell it how you feel — in English or Filipino — for safe home-care tips. Ask "what are my medications today?" and it answers from your phone only. Toggle the speaker icon to have replies read aloud.',
        },
        {
          heading: '🛡 Editing your info',
          body: 'To change personal information, verify once by scanning the QR on your National ID (eVerify). This protects your record from tampering.',
        },
      ]}
    />
  );
}
