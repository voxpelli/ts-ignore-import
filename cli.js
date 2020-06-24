#!/usr/bin/env node

// @ts-check
/// <reference types="node" />

'use strict';

// *** CLI setup ***

const meow = require('meow');

const cli = meow(`
    Usage
      $ ts-ignore-import [...declaration files]

    Required options
      --allow, -a           Adds a

    Options
      --dry-run             Runs everything as normal, but doesn't do any changes
      --help                When set, this help will be printed
      --verbose             When set, more verbose feedback will be surfaced
      --version             When set, this tools version will be printed

    Examples
      $ ts-ignore-import --allow=bunyan-adapter path/to/file.d.ts
`, {
  flags: {
    allow: { type: 'string', alias: 'a', isMultiple: true },
    'config-file': { type: 'string', alias: 'c' },
    'project-dir': { type: 'string', alias: 'p' },
    'dry-run': { type: 'boolean', 'default': false },
    silent: { type: 'boolean', 'default': false },
    verbose: { type: 'boolean', alias: 'v', 'default': false },
  }
});

const declarationFilePaths = cli.input.length ? cli.input : undefined;

const {
  allow: allowedDependencies,
  tsConfigFilePath,
  projectDirPath,
  dryRun,
  silent,
  verbose,
} = cli.flags;

// *** Tool setup ***

const chalk = require('chalk');
const { addAllIgnores } = require('.');

/** @type {import('.').VerboseLog} */
let verboseLog;

const VERBOSE_LOG_TITLE_PAD = 30;
const VERBOSE_LOG_MESSAGE_PAD = 20;

if (verbose) {
  /** @type {import('.').VerboseLog} */
  verboseLog = (title, message, extras) => {
    /** @type {(string|undefined)[]} */
    const strings = [
      title && chalk.bold(title.padEnd(VERBOSE_LOG_TITLE_PAD)),
      title && extras ? (message || '').padEnd(VERBOSE_LOG_MESSAGE_PAD) : message,
      extras && chalk.dim(extras),
    ]
      .filter(item => !!item);

    // eslint-disable-next-line no-console
    console.log(...strings);
  };
} else {
  verboseLog = () => {};
}

if (dryRun) verboseLog('Doing a dry run:', 'Yes');
verboseLog(
  'Allowed dependencies:',
  allowedDependencies ? [...allowedDependencies].sort().join(', ') : '',
  (!allowedDependencies || allowedDependencies.length === 0) ? 'No allowed dependencies' : ''
);

addAllIgnores({
  declarationFilePaths,
  // TODO [meow@>7.0.1]: Remove @ts-ignore if issue has been fixed
  // @ts-ignore See https://github.com/sindresorhus/meow/issues/155
  tsConfigFilePath,
  // TODO [meow@>7.0.1]: Remove @ts-ignore if issue has been fixed
  // @ts-ignore See https://github.com/sindresorhus/meow/issues/155
  projectDirPath,
}, {
  // TODO [meow@>7.0.1]: Remove @ts-ignore if PR has been merged
  // @ts-ignore Fix in https://github.com/sindresorhus/meow/pull/154
  allowedDependencies,
  // TODO [meow@>7.0.1]: Remove @ts-ignore if issue has been fixed
  // @ts-ignore See https://github.com/sindresorhus/meow/issues/155
  dryRun,
  verboseLog,
  resolveWithCwd: true,
})
  .then(allIgnores => {
    // eslint-disable-next-line no-console
    if (!silent) console.log(chalk.dim('\nIn total'), chalk.bold(allIgnores.size), chalk.dim('ignored dependencies.'));
    const ignores = [...allIgnores].sort();
    if (ignores.length) {
      verboseLog('');
      verboseLog('All ignored dependencies:', ignores.join(', '));
    }
  })
  .catch(err => {
    // eslint-disable-next-line no-console
    console.error(chalk.stderr.bold('An unexpected error occured:'), err.message);
    process.exit(1);
  });
