// @ts-check
/// <reference types="node" />

'use strict';

/**
 * @typedef DoYourThingOptions
 * @property {number} stuffDerivedFromInput
 * @property {boolean} [dryRun]
 * @property {boolean} [verbose]
 */

/**
 *
 * @param {DoYourThingOptions} options
 * @returns {Promise<*>}
 */
const doYourThing = async (options) => {
  const {
    dryRun = false,
    verbose = false,
    stuffDerivedFromInput
  } = options;

  // TODO: Of course replace "stuffDerivedFromInput" with an actually useful variable name, validation and JSDoc declaration
  if (typeof stuffDerivedFromInput !== 'number') throw new TypeError('Expected stuffDerivedFromInput to be a number');

  console.log('Hi', stuffDerivedFromInput);

  if (verbose) console.log('Verbose output!');
  if (dryRun) console.log('Not applying any changes, just testing what changes would have been applied if we were going to do this for real!');
};

module.exports = { doYourThing };
