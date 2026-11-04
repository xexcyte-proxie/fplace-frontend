/** Static copy and links for production settings / about / legal screens. */

export const APP_VERSION = '0.1.0';

export const SETTINGS_SUPPORT = {
  email: 'support@fplaces.app',
  mailto: 'mailto:support@fplaces.app?subject=fPlaces%20support',
} as const;

export const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  updated: 'July 15, 2026',
  sections: [
    {
      heading: 'What we collect',
      body: 'Account details you provide (email, pseudo-name, interests), venue preferences, and optional location data used for indoor navigation while the app is in use.',
    },
    {
      heading: 'How we use it',
      body: 'We use this information to run your account, personalize the venue feed, deliver notifications you opt into, and provide map and AR navigation features.',
    },
    {
      heading: 'Sharing',
      body: 'We do not sell your personal data. Content you post in a venue feed is visible to other attendees in that venue. Service providers that host our API may process data on our behalf.',
    },
    {
      heading: 'Your choices',
      body: 'You can update your pseudo-name and interests anytime, turn off notifications, change venue, log out, or request account deletion from Settings.',
    },
    {
      heading: 'Contact',
      body: 'Questions about privacy: support@fplaces.app',
    },
  ],
} as const;

export const TERMS_OF_USE = {
  title: 'Terms of Use',
  updated: 'July 15, 2026',
  sections: [
    {
      heading: 'Using fPlaces',
      body: 'fPlaces helps you navigate venues and connect anonymously with other attendees. You must be old enough to use the app in your region and follow venue rules while on site.',
    },
    {
      heading: 'Your account',
      body: 'Keep your login credentials secure. Choose a pseudo-name that does not reveal your real identity if you want to stay anonymous. You are responsible for content you post.',
    },
    {
      heading: 'Community standards',
      body: 'Do not harass others, post illegal content, spam, or misuse Alerts channels for non-emergencies. We may remove content or suspend accounts that break these rules.',
    },
    {
      heading: 'Navigation disclaimer',
      body: 'Map and AR guidance are aids only. Always watch your surroundings and follow venue staff and posted safety instructions.',
    },
    {
      heading: 'Contact',
      body: 'Questions about these terms: support@fplaces.app',
    },
  ],
} as const;

/** Same-origin page loaded in the in-app Terms WebView sheet. */
export const TERMS_OF_USE_URL = '/legal/terms.html';

export type LegalDocument = typeof PRIVACY_POLICY | typeof TERMS_OF_USE;
