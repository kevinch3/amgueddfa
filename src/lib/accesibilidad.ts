// The site's accessibility target and what it may claim (see /accesibilidad/).
//
// W3C lets a site show its WCAG conformance logo as the site's own claim (W3C does
// not verify it), but only after a thorough evaluation that includes people, not
// just tools, and with the claim's date, version, level and scope stated. Until
// then CLAIM stays null: the statement says "partially conformant", lists what is
// missing, and the footer shows no logo.
//
// To claim: fix or scope out the known limitations, have people test with screen
// readers, put the W3C logo file in public/ (see README, «Accesibilidad»), and set
// CLAIM to the date of that evaluation.

export const WCAG = {
  title: 'Web Content Accessibility Guidelines (WCAG) 2.2',
  version: '2.2',
  level: 'AA',
  uri: 'https://www.w3.org/TR/WCAG22/',
  /** W3C's page explaining Level AA, which its logo must link to. */
  explanation: 'https://www.w3.org/WAI/WCAG2AA-Conformance',
  /** The logo, copied from https://www.w3.org/WAI/WCAG22/wcag2.2AA.svg (local copies are allowed). */
  logo: 'wcag2.2AA.svg',
  /** W3C asks local copies to keep its own alternative text and link title (in English). */
  logoAlt: 'Level AA conformance, W3C Web Content Accessibility Guidelines 2.2',
  logoTitle: 'Explanation of WCAG 2 Level AA conformance',
} as const;

/** Date of the latest self-evaluation (tools and manual review); shown on /accesibilidad/. */
export const EVALUATED = '2026-11-16';

/** A full conformance claim, with the date it was evaluated; null while only partially conformant. */
export const CLAIM: { date: string } | null = null;
