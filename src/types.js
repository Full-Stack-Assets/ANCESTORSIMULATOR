/**
 * @typedef {Object} Waypoint
 * @property {number} seq
 * @property {string} place
 * @property {number|null} lat
 * @property {number|null} lng
 * @property {string|null} date
 * @property {number|null} year
 * @property {string} event
 * @property {string|null} narrative
 * @property {'documented'|'inferred'|'legend'} confidence
 */

/**
 * @typedef {Object} ChildSummary
 * @property {string} name
 * @property {string} fate
 */

/**
 * @typedef {Object} Occupation
 * @property {string} value
 * @property {'documented'|'inferred'|'legend'} confidence
 */

/**
 * @typedef {Object} SpouseSummary
 * @property {string} name
 * @property {number|null} birthYear
 * @property {number|null} deathYear
 * @property {number|null} marriageYear
 * @property {string|null} marriagePlace
 * @property {'documented'|'inferred'|'legend'} confidence
 */

/**
 * @typedef {Object} Chapter
 * @property {string} id
 * @property {string} name
 * @property {number|null} birthYear
 * @property {number|null} deathYear
 * @property {string} summary
 * @property {string} journeyStatus
 * @property {Waypoint[]} waypoints
 * @property {Occupation|null} occupation
 * @property {SpouseSummary|null} spouse
 * @property {string|null} legacyNote
 * @property {string|null} familyNote
 * @property {ChildSummary[]} children
 * @property {string|null} childrenNote
 * @property {'documented'|'inferred'|'legend'|undefined} childrenConfidence
 */

/**
 * @typedef {Object} ChapterEntry
 * @property {Chapter} data
 * @property {string} teaser
 */

export {};
