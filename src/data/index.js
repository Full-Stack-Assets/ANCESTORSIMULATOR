export { WILLIAM } from './william.js';
export { JOSIAH } from './josiah.js';

import { WILLIAM } from './william.js';
import { JOSIAH } from './josiah.js';

/** @type {{ slug: string, teaser: string }[]} */
export const CHAPTER_MANIFEST = [
  { slug: 'william', teaser: 'An Irish Quaker who crossed an ocean to found a settlement.' },
  {
    slug: 'josiah',
    teaser: 'His son — a shoemaker who never left the fifteen miles his father settled.',
  },
];

const DATA_BY_SLUG = { william: WILLIAM, josiah: JOSIAH };

/** @type {import('../types.js').ChapterEntry[]} */
export const CHAPTERS = CHAPTER_MANIFEST.map((entry) => ({
  data: DATA_BY_SLUG[entry.slug],
  teaser: entry.teaser,
}));
