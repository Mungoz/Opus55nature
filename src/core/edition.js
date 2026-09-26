// Which game this is: the horror walk (the default) or the original nature scene. A literal
// in a build (see vite.config.js), so each build keeps only its own edition's code.
/* global __HORROR__ */
export const HORROR = __HORROR__;
export const EDITION = HORROR ? 'horror' : 'nature';
