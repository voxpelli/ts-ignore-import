#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { lilconfig } from 'lilconfig';
import { formatHelpMessage, peowly } from 'peowly';
import { messageWithCauses, stackWithCauses } from 'pony-cause';

import { addAllIgnores } from './index.js';
import { log, verboseLog as rawVerboseLog } from './lib/log.js';

// *** CLI setup ***

const flags = /** @satisfies {import('peowly').AnyFlags} */ ({
  allow: {
    description: 'Marks a module as allowed. It will then not have a @ts-ignore added. (Already added ignores are kept though)',
    listGroup: 'Core options',
    multiple: true,
    'short': 'a',
    type: 'string',
  },
  skip: {
    description: 'Skip a specific file. Follows .gitignore syntax. Matched against file paths relative to resolved path of ts-config',
    listGroup: 'Core options',
    multiple: true,
    'short': 'i',
    type: 'string',
  },
  'ts-config': {
    description: 'Point to a tsconfig.json file to override any auto-discovered one',
    listGroup: 'Core options',
    'short': 't',
    type: 'string',
  },
  debug: { type: 'boolean', 'default': false, description: 'Activates some very verbose logging' },
  'dry-run': { type: 'boolean', 'default': false, description: 'Runs everything like normal, but doesn\'t save any changes' },
  silent: { type: 'boolean', 'default': false, description: 'When set, no feedback will be printed' },
  verbose: { type: 'boolean', 'default': false, 'short': 'v', description: 'When set, more verbose feedback will be printed' },
});

const name = 'ts-ignore-import';

const cli = peowly({
  help: formatHelpMessage(name, {
    examples: ['--allow=bunyan-adapter path/to/file.d.ts'],
    flags,
    usage: '[...declaration files]',
  }),
  name,
  options: flags,
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  pkg: JSON.parse(await readFile(new URL('package.json', import.meta.url), 'utf8')),
});

const declarationFilePaths = cli.input.length ? cli.input : undefined;

let {
  'ts-config': tsConfigFilePath,
} = cli.flags;

const {
  allow: allowedDependencies,
  debug,
  'dry-run': dryRun,
  silent,
  skip: ignoreFile,
  verbose,
} = cli.flags;

// *** Logging setup ***

/** @type {import('./index.js').VerboseLog} */
const verboseLog = (verbose || debug) ? rawVerboseLog : () => {};

verboseLog('Time to ignore TypeScript imports!');

// *** Tool setup ***

if (dryRun) verboseLog('Doing a dry run:', 'Yes');

try {
  const result = await lilconfig('tsignoreimport', {
    packageProp: 'tsIgnoreImport',
  }).search();

  // TODO: Use eg ajv to validate
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
    tsConfigFilePath,
  }, {
    allowedDependencies: mergedAllowedDependencies,
    dryRun,
    ignoreFiles: mergedIgnoreFiles.length ? mergedIgnoreFiles : undefined,
    debug,
    verboseLog,
    resolveWithCwd: true,
  });

  if (!silent) {
    log(
      'log',
      `Found and ignored ${ignored.size} ${ignored.size === 1 ? 'dependency' : 'dependencies'} across ${sourceFileCount} ${sourceFileCount === 1 ? 'file' : 'files'}:`,
      [...ignored].sort().join(', ')
    );
  }
} catch (err) {
  if (err instanceof Error) {
    log('error', 'An error occured:', messageWithCauses(err));
    verboseLog('Stacktrace:');
    verboseLog('', stackWithCauses(err));
  } else {
    log('error', 'An undefined error occured');
  }

  process.exit(1);
}
