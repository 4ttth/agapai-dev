import { InfoPage } from '@/components/InfoPage';

export default function TermsScreen() {
  return (
    <InfoPage
      intro="By using AgapAI you agree to these terms. Please read them — they are short and in plain language."
      sections={[
        {
          heading: '1. What AgapAI is',
          body: 'AgapAI is a healthcare companion app: medication reminders, encrypted consultation records, document storage, and an AI wellness assistant. It works with eGovPH services (SSO, eVerify, eMessage, eGov AI).',
        },
        {
          heading: '2. Not a medical device',
          body: 'AgapAI and its AI assistant provide general wellness guidance only. They never diagnose, treat, or replace a licensed physician. For emergencies, call 911 or go to the nearest hospital.',
        },
        {
          heading: '3. Your account',
          body: 'You sign in with your eGovPH identity and register once to create your Health ID. Keep your phone secure — your Health ID QR unlocks your encrypted records for whoever scans it.',
        },
        {
          heading: '4. Professionals',
          body: 'Doctors and pharmacists are verified manually by administrators against the PRC registry before they can use AgapAI Pro. The license number of the professional who handled your visit appears on that consultation or dispense record for accountability.',
        },
        {
          heading: '5. Acceptable use',
          body: 'Do not misrepresent your identity, upload false medical records, or attempt to access data of patients who have not physically presented their Health ID to you.',
        },
        {
          heading: '6. Liability',
          body: 'AgapAI is provided “as is” during the eGov Hackathon pilot. To the extent permitted by law, the team is not liable for outcomes arising from use of the app.',
        },
      ]}
    />
  );
}
