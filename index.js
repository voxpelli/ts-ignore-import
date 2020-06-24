// @ts-check
/// <reference types="node" />

'use strict';

const path = require('path');
const pkgDir = require('pkg-dir');
const { Project, ts } = require('ts-morph');
const VError = require('verror');
const {
  constants: { F_OK },
  promises: { access: fsAccess },
} = require('fs');

/**
 * @callback VerboseLog
 * @param {string} title
 * @param {string} [message]
 * @param {string} [extras]
 * @returns {void}
 */

/**
 * @param {import('ts-morph').SourceFile} file
 * @param {string[]} allowedDependencies
 * @param {Set<string>} ignoreSet
 * @returns {boolean}
 */
const addIgnore = (file, allowedDependencies, ignoreSet) => {
  return file.getImportStringLiterals().some(literal => {
    const text = literal.getText();

    if (text.startsWith('".') || allowedDependencies.some(target => `"${target}"` === text)) return;

    const importNodeChild = literal.getParentWhile(node => ![ts.SyntaxKind.ImportType].includes(node.getKind()));
    const importNode = importNodeChild && importNodeChild.getParent();
    if (!importNode) return;

    /** @type {import('ts-morph').Node|undefined} */
    let firstOnLine;

    if (!importNode.isFirstNodeOnLine()) {
      const lineNumber = importNode.getStartLineNumber();
      firstOnLine = importNode.getParentWhile(parent => parent.getStartLineNumber() === lineNumber);
    }

    const lineToComment = firstOnLine || importNode;

    if (lineToComment.getLeadingCommentRanges().map(comment => comment.getText()).join('\n').includes('// @ts-ignore')) {
      ignoreSet.add(text);
    } else {
      const first = lineToComment.isFirstNodeOnLine();
      file.insertText(lineToComment.getStart(), (first ? '' : '\n') + '// @ts-ignore\n');
      ignoreSet.add(text);
      return true;
    }
  });
};

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
const fsExists = async (path) => {
  try {
    await fsAccess(path, F_OK);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * @typedef TargetPaths
 * @property {string[]|undefined} [declarationFilePaths]
 * @property {string|undefined} [projectDirPath]
 * @property {string|undefined} [tsConfigFilePath]
 */

/**
 * @typedef ResolvePathsOptions
 * @property {boolean} resolveWithCwd
 * @property {VerboseLog} verboseLog
 */

/**
 * @param {TargetPaths} paths
 * @param {ResolvePathsOptions} options
 * @returns {Promise<{ declarationFilePaths: string[], projectDirPath: string, tsConfigFilePath: string }>}
 */
const resolveTargetPaths = async (paths, options) => {
  const { resolveWithCwd, verboseLog, } = options;

  let {
    declarationFilePaths = [],
    tsConfigFilePath,
    projectDirPath,
  } = paths;

  if (!tsConfigFilePath) {
    if (!projectDirPath && declarationFilePaths[0] && path.isAbsolute(declarationFilePaths[0])) {
      projectDirPath = path.dirname(declarationFilePaths[0]);
      if (projectDirPath) verboseLog('', '', 'Path will be based on first declaration file: ' + declarationFilePaths[0]);
    }
    if (!projectDirPath && require.main) {
      const requireMainPkgDirPath = await pkgDir(require.main.filename);
      if (requireMainPkgDirPath && requireMainPkgDirPath !== __dirname) projectDirPath = requireMainPkgDirPath;
      if (projectDirPath) verboseLog('', '', 'Path will be based on main package: ' + require.main.filename);
    }
    if (!projectDirPath && resolveWithCwd) {
      const cwdTsConfigFilePath = path.resolve(process.cwd(), './tsconfig.json');
      if (await fsExists(cwdTsConfigFilePath)) {
        tsConfigFilePath = cwdTsConfigFilePath;
        verboseLog('', '', 'Resolved tsconfig.json by using current working directory: ' + cwdTsConfigFilePath);
      }
    }
    if (projectDirPath) {
      tsConfigFilePath = path.resolve(projectDirPath, './tsconfig.json');
      if (projectDirPath) verboseLog('Resolved tsconfig.json by using relative path.');
    }
  }
  if (!tsConfigFilePath) throw new Error('Can not figure out where to look for tsconfig.json file');
  if (!projectDirPath) {
    projectDirPath = path.dirname(tsConfigFilePath);
    if (projectDirPath) verboseLog('', '', 'Setting relative path to the path of tsconfig.json.');
  }
  if (projectDirPath && declarationFilePaths.length === 0) {
    const guessedDeclarationFilePath = path.resolve(projectDirPath, './index.d.ts');
    if (await fsExists(guessedDeclarationFilePath)) {
      declarationFilePaths[0] = guessedDeclarationFilePath;
      verboseLog('', '', 'Resolved the declaration file paths by using current tsconfig.json: ' + guessedDeclarationFilePath);
    } else {
      throw new Error('Failed to find declaration file path.');
    }
  }
  return {
    declarationFilePaths,
    projectDirPath,
    tsConfigFilePath
  };
};

/** @typedef {ResolvePathsOptions & { allowedDependencies?: string[]|undefined, dryRun?: boolean, verboseLog?: VerboseLog }} AddIgnoresOptions */

/**
 * @param {TargetPaths} target
 * @param {AddIgnoresOptions} options
 * @returns {Promise<Set<string>>}
 */
const addAllIgnores = async (target, options) => {
  const {
    allowedDependencies = [],
    dryRun = false,
    resolveWithCwd = false,
    verboseLog = () => {},
  } = options;

  const {
    declarationFilePaths,
    tsConfigFilePath,
    projectDirPath,
  } = await resolveTargetPaths(target, { resolveWithCwd, verboseLog });

  /** @type {Set<string>} */
  let completeIgnoreSet = new Set();

  verboseLog('', '', 'Figuring out configuration...');

  const project = new Project({
    tsConfigFilePath,
    addFilesFromTsConfig: false
  });

  verboseLog('Paths will be relative to:', projectDirPath);
  verboseLog('Using tsconfig file at:', path.relative(projectDirPath, tsConfigFilePath), tsConfigFilePath);

  verboseLog('', '', 'Adding files...');
  for (const file of declarationFilePaths) {
    const filePath = path.resolve(projectDirPath, file);
    verboseLog('Adding file:', path.relative(projectDirPath, filePath), filePath);
    try {
      project.addSourceFileAtPath(filePath);
    } catch (err) {
      throw new VError(err, 'Failed to add source file');
    }
  }

  verboseLog('', '', 'Resolving dependencies...');
  project.resolveSourceFileDependencies();

  verboseLog('', '', 'Processing files...');
  for (const file of project.getSourceFiles()) {
    const ignoreSet = new Set();
    const filename = path.relative(projectDirPath, file.getFilePath());

    verboseLog('Processing:', filename, file.getFilePath());
    while (addIgnore(file, allowedDependencies, ignoreSet));

    const cleanedIgnores = [...ignoreSet].map(item => item.slice(1, -1));

    verboseLog(`Ignored ${cleanedIgnores.length} for:`, filename, cleanedIgnores.join(', '));

    if (cleanedIgnores.length === 0) {
      continue;
    }

    completeIgnoreSet = new Set([...completeIgnoreSet, ...cleanedIgnores]);

    if (dryRun) {
      verboseLog('Saving changes of:', filename, 'skipping due to dry-run');
    } else {
      verboseLog('Saving changes of:', filename);
      file.save();
    }
  }

  return completeIgnoreSet;
};

module.exports = { addAllIgnores };
