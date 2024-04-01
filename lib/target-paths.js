// @ts-check
/// <reference types="node" />

'use strict';

const {
  constants: { F_OK },
  promises: { access: fsAccess },
} = require('node:fs');
const path = require('node:path');

const globby = require('globby');
const ignore = require('ignore');
const pkgDir = require('pkg-dir');
const VError = require('verror');

/**
 * @typedef ResolvePossiblyGlobbedPathsOptions
 * @property {boolean} [allowRelative]
 * @property {boolean} [ignoreMissingFiles]
 * @property {import('..').VerboseLog} verboseLog
 */

/**
 * @typedef TargetPaths
 * @property {string[]|undefined} [declarationFilePaths]
 * @property {string|undefined} [projectDirPath]
 * @property {string|undefined} [tsConfigFilePath]
 */

/**
 * @typedef ResolvePathsOptions
 * @property {boolean} resolveWithCwd
 * @property {import('..').VerboseLog} verboseLog
 * @property {(string|import('ignore').Ignore)[]} ignoreFiles
 */

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
const fsExists = async (path) => {
  try {
    await fsAccess(path, F_OK);
    return true;
  } catch {
    return false;
  }
};

const BASIC_GLOBBY_OPTIONS = Object.freeze({ absolute: true });

/**
 * @param {string[]} entries
 * @param {string|undefined} projectDirPath
 * @param {ResolvePossiblyGlobbedPathsOptions} options
 * @returns {Promise<string[]>}
 */
const resolvePossiblyGlobbedPaths = async (entries, projectDirPath, options) => {
  const {
    allowRelative = false,
    ignoreMissingFiles = false,
    verboseLog,
  } = options;

  const isMagic = globby.hasMagic(entries, BASIC_GLOBBY_OPTIONS);

  if (isMagic) {
    if (!projectDirPath) throw new Error('Encountered glob patterns, but couldn\'t figure out what path to resolve them to.');

    verboseLog('Resolving globbed declaration file paths:', entries.length + ' paths', entries.join(', '), true);

    entries = await globby(entries, {
      ...BASIC_GLOBBY_OPTIONS,
      cwd: projectDirPath,
      expandDirectories: false,
    });

    verboseLog('Declaration files found in glob pattern:', entries.length + ' files', '', true);
  }

  /** @type {Set<string>} */
  const pathSet = new Set();

  for (const entry of entries) {
    if (!projectDirPath && !path.isAbsolute(entry)) {
      if (allowRelative) {
        pathSet.add(entry);
        break;
      } else {
        throw new Error(`Invalid file path. Either a relative directory or an absolute path is required, but got: ${entry}`);
      }
    }

    const normalizedFilePath = projectDirPath ? path.resolve(projectDirPath, entry) : path.normalize(entry);

    if (pathSet.has(normalizedFilePath)) continue;

    if (await fsExists(normalizedFilePath)) {
      pathSet.add(normalizedFilePath);
    } else if (!ignoreMissingFiles) {
      throw new Error(`Failed to find file: ${normalizedFilePath}`);
    }
  }

  return [...pathSet];
};

/**
 * @param {TargetPaths|undefined} paths
 * @param {ResolvePathsOptions} options
 * @returns {Promise<{ declarationFilePaths: string[], projectDirPath: string, tsConfigFilePath: string }>}
 */
const resolveTargetPaths = async (paths = {}, options) => {
  const {
    ignoreFiles,
    resolveWithCwd,
    verboseLog,
  } = options;

  let {
    declarationFilePaths = [],
    tsConfigFilePath,
    projectDirPath,
  } = paths;

  if (!declarationFilePaths || declarationFilePaths.length === 0) {
    declarationFilePaths = ['index.d.ts'];
  }

  // Resolve tsConfigFilePath and maybe projectDirPath
  if (!tsConfigFilePath) {
    if (!projectDirPath && !globby.hasMagic(declarationFilePaths, BASIC_GLOBBY_OPTIONS)) {
      const [firstPath] = await resolvePossiblyGlobbedPaths(
        declarationFilePaths,
        undefined,
        { verboseLog: () => {}, allowRelative: true }
      );
      if (firstPath && path.isAbsolute(firstPath)) projectDirPath = firstPath;
      if (projectDirPath) verboseLog('Path will be based on first declaration file:', firstPath, '', true);
    }
    if (!projectDirPath && require.main && require.main.filename) {
      const requireMainPkgDirPath = await pkgDir(require.main.filename);
      if (requireMainPkgDirPath && requireMainPkgDirPath !== await pkgDir(__dirname)) projectDirPath = requireMainPkgDirPath;
      if (projectDirPath) verboseLog('Path will be based on main package:', require.main.filename, '', true);
    }
    if (!projectDirPath && resolveWithCwd) {
      const [firstPath] = await resolvePossiblyGlobbedPaths(
        declarationFilePaths,
        process.cwd(),
        { verboseLog: () => {}, ignoreMissingFiles: true }
      );
      if (firstPath && path.isAbsolute(firstPath)) {
        projectDirPath = process.cwd();
        if (projectDirPath) verboseLog('File found at current working directory, setting path:', projectDirPath, '', true);
      }
    }
    if (projectDirPath || resolveWithCwd) {
      tsConfigFilePath = path.resolve(projectDirPath || process.cwd(), './tsconfig.json');
      if (await fsExists(tsConfigFilePath)) {
        verboseLog('Resolved tsconfig.json using path:', tsConfigFilePath, '', true);
      } else {
        const resolvedPkgDir = await pkgDir(projectDirPath || process.cwd());
        tsConfigFilePath = resolvedPkgDir && path.resolve(resolvedPkgDir, './tsconfig.json');
        if (tsConfigFilePath && await fsExists(tsConfigFilePath)) {
          verboseLog('Resolved tsconfig.json in package.json folder of path:', tsConfigFilePath, '', true);
        } else {
          tsConfigFilePath = undefined;
        }
      }
    }
  }

  // If we find no tsconfig.json file, then we can not continue
  if (!tsConfigFilePath) throw new Error('Can not figure out where to look for tsconfig.json file');
  if ((await fsExists(tsConfigFilePath)) === false) throw new Error(`No file at expected tsconfig.json location: ${tsConfigFilePath}`);

  // Resolve projectDirPath
  if (!projectDirPath) {
    projectDirPath = path.dirname(tsConfigFilePath);
    if (projectDirPath) verboseLog('Setting path to that of tsconfig.json:', projectDirPath, '', true);
  }
  if (!projectDirPath) throw new Error('Can not figure out the path');

  try {
    verboseLog('Resolving declaration paths:', declarationFilePaths.length + ' paths', projectDirPath, true);
    declarationFilePaths = await resolvePossiblyGlobbedPaths(declarationFilePaths, projectDirPath, { verboseLog });
    verboseLog('Declaration files found:', declarationFilePaths.length + ' files', '', true);
  } catch (err) {
    throw new VError(err, 'Failed to resolve declaration paths');
  }

  projectDirPath = path.dirname(tsConfigFilePath);

  if (declarationFilePaths[0]) {
    const sharedTopPath = path.resolve(path.dirname(declarationFilePaths[0]), path.dirname(path.relative(path.dirname(tsConfigFilePath), path.dirname(declarationFilePaths[0]))));

    /** @type {string[]} */
    const relativeDeclarationFilePaths = [];
    for (const file of declarationFilePaths) {
      relativeDeclarationFilePaths.push(path.relative(sharedTopPath, file));
    }

    /** @type {import('ignore').Ignore|undefined} */
    // @ts-ignore
    const ignoreDefinition = ignoreFiles.length ? ignore().add(ignoreFiles) : undefined;

    ignoreFiles.length && verboseLog('Applying ignore rules:', ignoreFiles.length + ' rules', '', true);

    declarationFilePaths = (
      ignoreDefinition
        // eslint-disable-next-line unicorn/no-array-callback-reference
        ? ignoreDefinition.filter(relativeDeclarationFilePaths)
        : relativeDeclarationFilePaths
    ).map(file => path.resolve(sharedTopPath, file));

    ignoreFiles.length && verboseLog('Ignored declaration files:', (relativeDeclarationFilePaths.length - declarationFilePaths.length) + ' files', '', true);
  }

  verboseLog('Declaration files to use:', declarationFilePaths.length + ' files', '', true);

  return {
    declarationFilePaths,
    projectDirPath,
    tsConfigFilePath
  };
};

module.exports = { resolveTargetPaths };
