/**
 * Single point of contact between api/src and the checked-in persona config.
 * Every other file imports from here (never reaches into ../../config
 * directly) so tests can mock one module and forks only ever edit one file
 * (/config/persona.ts).
 */
export { persona } from "../../config/persona.js";
