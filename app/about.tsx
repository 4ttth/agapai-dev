import { InfoPage } from '@/components/InfoPage';

export default function AboutScreen() {
  return (
    <InfoPage
      intro="AgapAI Health — alaga at agapay sa kalusugan ng bawat Pilipino."
      sections={[
        {
          heading: 'Version',
          body: 'AgapAI Patient App 2.0.0 (eGov Hackathon build).',
        },
        {
          heading: 'Built on eGovPH',
          body: 'Sign-in via eGov SSO · identity checks via eVerify (PhilSys) · SMS reminders via eMessage · assistant powered by eGov AI, with AgapAI’s own curated home-remedy engine for health questions.',
        },
        {
          heading: 'The AgapAI ecosystem',
          body: 'Patient app (this one) · AgapAI Pro for doctors and pharmacists · a web console for administrators with service health, usage metrics, and PRC verification.',
        },
        {
          heading: 'Privacy by design',
          body: 'Consultations are end-to-end encrypted with a patient-held key. Documents and mood data never leave your phone. See the Privacy Policy for details.',
        },
      ]}
    />
  );
}
