#!/usr/bin/env node

// @ts-check
/// <reference types="node" />

'use strict';

// *** CLI setup ***

const meow = require('meow');

const cli = meow(`
    Usage
      $ tool-name [...input]

    Required options
      --option, -o          An option of some kind

    Options
      --dry-run             Runs everything as normal, but doesn't do any changes
      --help                When set, this help will be printed
      --verbose             When set, more verbose feedback will be surfaced
      --version             When set, this tools version will be printed

    Examples
      $ do-your-thing --option wow maybe/a/path/to/something
`, {
  flags: {
    option: {
      type: 'string',
      alias: 'o'
    },
    dryRun: { type: 'boolean' },
    verbose: { type: 'boolean' },
  }
});

const input = cli.input;

const {
  dryRun,
  verbose
} = cli.flags;

// *** Tool setup ***

const { doYourThing } = require('.');

// Do something with the in put, if you're accepting any. Probably don't send it forward un-sanitized to your tool right away
const stuffDerivedFromInput = input.length;

doYourThing({
  dryRun,
  stuffDerivedFromInput,
  verbose,
})
  .catch(() => {
    console.error('An unexpected error occured');
    process.exit(1);
  });
