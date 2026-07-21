import { InfoPage } from '@/components/InfoPage';

export default function PrivacyScreen() {
  return (
    <InfoPage
      intro="AgapAI is built on a simple principle: your health data belongs to you — not to the app, the server, your doctor, your pharmacist, or eGov."
      sections={[
        {
          heading: 'What we collect',
          body: 'Your Health ID profile (name, blood type, allergies, conditions, emergency contact) is stored on the AgapAI server so doctors and pharmacists you personally show your QR to can serve you. Consultation records are stored only in encrypted form.',
        },
        {
          heading: 'End-to-end encryption',
          body: 'Consultation records and prescriptions are encrypted on your doctor’s device using a key that lives in your Health ID QR. The server stores only unreadable ciphertext. Nobody — not the server operators, not eGov, not even the doctor after uploading — can decrypt your records without you physically presenting your QR.',
        },
        {
          heading: 'What stays on your phone',
          body: 'Scanned documents, your daily mood check-ins, medication dose history, and AI assistant questions about your own data are processed and stored on this phone only.',
        },
        {
          heading: 'National ID handling',
          body: 'When you verify via eVerify, only the QR code value is transmitted for verification. Any photo of your ID used for scanning is deleted immediately and never uploaded.',
        },
        {
          heading: 'SMS reminders',
          body: 'Your mobile number and medication schedule are used solely to send you reminder texts through the government eMessage service. You can stop these anytime by removing your medicines or your number.',
        },
        {
          heading: 'Your rights',
          body: 'Under the Data Privacy Act of 2012 (RA 10173), you may access, correct, or request deletion of your data at any time from More → Edit personal information, or by contacting the AgapAI team.',
        },
      ]}
    />
  );
}
