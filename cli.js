#!/usr/bin/env node

// @ts-check
/// <reference types="node" />

'use strict';

const path = require('node:path');

const chalk = require('chalk');
const { cosmiconfig } = require('cosmiconfig');
const meow = require('meow');
const { messageWithCauses, stackWithCauses } = require('pony-cause');

const { addAllIgnores } = require('.');

// *** CLI setup ***

const cli = meow(`
    Usage
      $ ts-ignore-import [...declaration files]

    Adds @ts-ignore to imports/requires in TypeScript declaration files. By default it adds it to all imports/requires, but one can mark modules to be exempted from it by using the --allow flag.

    Auto-discoveres tsconfig.json if none has been specified and uto-discoveres a top level index.d.ts declaration file if no specific declaration files has been specified.

    Will traverse all local declaration files depended on by included declaration files and process them as well.

    Core options
      --allow, -a           Marks a module as allowed. It will then not have a @ts-ignore added. (Already added ignores are kept though)
      --skip, -s            Skip a specific file. Follows .gitignore syntax. Matched against file paths relative to resolved path of ts-config.
      --ts-config, -t       Point to a tsconfig.json file to override any auto-discovered one

    Additional options
      --debug               Activates some very verbose logging
      --dry-run             Runs everything like normal, but doesn't save any changes
      --help                When set, this help will be printed
      --silent              When set, no feedback will be printed
      --verbose, -v         When set, more verbose feedback will be printed
      --version             When set, this tools version will be printed

    Examples
      $ ts-ignore-import --allow=bunyan-adapter path/to/file.d.ts
`, {
  flags: {
    allow: { type: 'string', alias: 'a', isMultiple: true },
    skip: { type: 'string', alias: 'i', isMultiple: true },
    'ts-config': { type: 'string', alias: 't' },
    debug: { type: 'boolean', 'default': false },
    'dry-run': { type: 'boolean', 'default': false },
    silent: { type: 'boolean', 'default': false },
    verbose: { type: 'boolean', alias: 'v', 'default': false },
  },
});

const declarationFilePaths = cli.input.length ? cli.input : undefined;

let {
  tsConfig: tsConfigFilePath,
} = cli.flags;

const {
  allow: allowedDependencies,
  debug,
  dryRun,
  silent,
  skip: ignoreFile,
  verbose,
} = cli.flags;

// *** Logging setup ***

const LOG_TITLE_PAD = 30;
const LOG_MESSAGE_PAD = 25;
const LOG_TITLE_PAD_LONG = LOG_TITLE_PAD + LOG_MESSAGE_PAD + 1;
const LOG_MESSAGE_PAD_LONG = LOG_MESSAGE_PAD + 10;

/**
 * @param {'log'|'error'} level
 * @param {string} title
 * @param {string} [message]
 * @param {string} [extras]
 * @param {boolean} [dimItAll]
 * @returns {void}
 */
const log = (level, title, message, extras, dimItAll) => {
  /** @type {string} */
  let resolvedMessage = [
    title && chalk.bold((message || extras) ? title.padEnd(title.length > LOG_TITLE_PAD ? LOG_TITLE_PAD_LONG : LOG_TITLE_PAD) : title),
    extras ? (message || '').padEnd(message && message.length >= LOG_MESSAGE_PAD ? LOG_MESSAGE_PAD_LONG : LOG_MESSAGE_PAD) : message,
    extras && chalk.dim(extras),
  ]
    .filter(item => !!item)
    .join(' ');

  if (dimItAll) resolvedMessage = chalk.dim(resolvedMessage);
  if (level === 'error') resolvedMessage = chalk.bgRed.whiteBright(resolvedMessage);

  // eslint-disable-next-line no-console
  console[level](resolvedMessage);
};

/** @type {import('.').VerboseLog} */
const verboseLog = (verbose || debug)
  ? (title, message, extras, dimItAll) => log('log', title, message, extras, dimItAll)
  : () => {};

verboseLog('Time to ignore TypeScript imports!');

// *** Tool setup ***

if (dryRun) verboseLog('Doing a dry run:', 'Yes');

const explorer = cosmiconfig('tsignoreimport', {
  packageProp: 'tsIgnoreImport',
});

explorer.search().then(async (result) => {
  const config = (result && result.config) || {};

  if (result && result.config) verboseLog('Uses configuration file:', result.filepath);

  const mergedIgnoreFiles = [
    ...(Array.isArray(config.skipFiles) ? config.skipFiles : []),
    ...(ignoreFile || []),
  ];

  const mergedAllowedDependencies = [
    ...(Array.isArray(config.allow) ? config.allow : []),
    ...(allowedDependencies || []),
  ];

  const mergedDeclarationFilePaths = [
    ...(Array.isArray(config.files) ? config.files : []),
    ...(declarationFilePaths || []),
  ];

  if (result && !tsConfigFilePath && config.tsConfigFilePath) {
    tsConfigFilePath = path.resolve(result.filepath, config.tsConfigFilePath);
  }

  verboseLog(
    'Allowed dependencies:',
    mergedAllowedDependencies.length + ' dependencies',
    mergedAllowedDependencies.length ? [...mergedAllowedDependencies].sort().join(', ') : ''
  );

  const { ignored, sourceFileCount } = await addAllIgnores({
    declarationFilePaths: mergedDeclarationFilePaths,
    // TODO [meow@>7.0.1]: Remove @ts-ignore if issue has been fixed
    // @ts-ignore See https://github.com/sindresorhus/meow/issues/155
    tsConfigFilePath,
  }, {
    allowedDependencies: mergedAllowedDependencies,
    // TODO [meow@>7.0.1]: Remove @ts-ignore if issue has been fixed
    // @ts-ignore See https://github.com/sindresorhus/meow/issues/155
    dryRun,
    ignoreFiles: mergedIgnoreFiles.length ? mergedIgnoreFiles : undefined,
    debug,
    verboseLog,
    resolveWithCwd: true,
  });

  // TODO: Remove ignore when refactored into ESM module
  // eslint-disable-next-line promise/always-return
  if (!silent) {
    log('log', `Found and ignored ${ignored.size} ${ignored.size === 1 ? 'dependency' : 'dependencies'} across ${sourceFileCount} ${sourceFileCount === 1 ? 'file' : 'files'}:`, [...ignored].sort().join(', '));
  }
})
  // TODO: Remove ignore when refactored into ESM module
  // eslint-disable-next-line unicorn/prefer-top-level-await
  .catch(err => {
    log('error', 'An error occured:', messageWithCauses(err.message));
    verboseLog('Stacktrace:');
    verboseLog('', stackWithCauses(err));
    process.exit(1);
  });
