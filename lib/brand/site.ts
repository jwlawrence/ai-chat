// Single source of truth for site identity and author contact details.
// Metadata routes (app/layout.tsx, app/opengraph-image.tsx), the landing page,
// and user-facing fallback copy all read from here so a rename or URL change
// lands in one place.

export const SITE_URL = 'https://ai-chat-by-josh.vercel.app';
export const SITE_NAME = 'AI Chat';
export const SITE_TITLE = 'AI Chat, a chat that responds with interactive UI';
export const SITE_TAGLINE = 'A chat that responds with interactive UI';

export const AUTHOR_NAME = 'Joshua Lawrence';
export const AUTHOR_LINKEDIN_URL = 'https://linkedin.com/in/joshlawrence';
/** Where visitors should email if the contact form's delivery fails. */
export const CONTACT_FALLBACK_EMAIL = 'jlawrence@linkedin.com';

export const SITE_DESCRIPTION = `A portfolio piece by ${AUTHOR_NAME}. The model dynamically answers with interactive components, not plain text.`;
