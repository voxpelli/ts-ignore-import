// @ts-check
/// <reference types="node" />

'use strict';

const path = require('node:path');
const { Project, ts } = require('ts-morph');
const VError = require('verror');

const { resolveTargetPaths } = require('./lib/target-paths');

/**
 * @callback VerboseLog
 * @param {string} title
 * @param {string|undefined} [message]
 * @param {string|undefined} [extras]
 * @param {boolean|undefined} [dimItAll]
 * @returns {void}
 */

/**
 * @param {import('ts-morph').SourceFile} file
 * @param {string[]} allowedDependencies
 * @param {Set<string>} ignoreSet
 * @param {{ debugLog: VerboseLog }} options
 * @returns {boolean}
 */
const addIgnore = (file, allowedDependencies, ignoreSet, { debugLog }) => {
  for (const literal of file.getImportStringLiterals()) {
    const text = literal.getText();

    if (text.startsWith('".') || text.startsWith('\'.')) {
      continue;
    }
    if (allowedDependencies.some(target => {
      if (`"${target}"` === text) return true;
      if (`'${target}'` === text) return true;
      if (text.startsWith(`"${target}/`)) return true;
      if (text.startsWith(`'${target}/`)) return true;
      return false;
    })) {
      continue;
    }

    const importNodeChild = literal.getParentWhile(node => ![ts.SyntaxKind.ImportType].includes(node.getKind()));
    const importNode = importNodeChild && importNodeChild.getParent();
    if (!importNode) {
      continue;
    }

    /** @type {import('ts-morph').Node|undefined} */
    let firstOnLine;

    const lineNumber = importNode.getStartLineNumber();

    if (lineNumber !== 1 && !importNode.isFirstNodeOnLine()) {
      firstOnLine = importNode.getParentWhile(parent => parent.getStartLineNumber() === lineNumber);
    }

    const lineToComment = firstOnLine || importNode;

    if (lineToComment.getLeadingCommentRanges().map(comment => comment.getText()).join('\n').includes('// @ts-ignore')) {
      if (!ignoreSet.has(text)) debugLog('Found additional module already ignored in code:', text, '', true);
      ignoreSet.add(text);
    } else {
      debugLog('Adding ignore for:', text, '', true);
      const first = false && lineToComment.isFirstNodeOnLine();
      file.insertText(lineToComment.getStart(), (first ? '' : '\n') + '// @ts-ignore\n');
      ignoreSet.add(text);
      // Found something to ignore, lets quit the loop and tell that we were successful!
      return true;
    }
  }

  return false;
};

/**
 * @typedef AddIgnoresOptions
 * @property {string[]|undefined} [allowedDependencies]
 * @property {(string|import('ignore').Ignore)[]|undefined} [ignoreFiles]
 * @property {boolean} [debug]
 * @property {boolean} [dryRun]
 * @property {boolean} [resolveWithCwd]
 * @property {VerboseLog} [verboseLog]
 */

/**
 * @param {import('./lib/target-paths').TargetPaths} [target]
 * @param {AddIgnoresOptions} [options]
 * @returns {Promise<{ ignored: Set<string>, sourceFileCount: number }>}
 */
const addAllIgnores = async (target, options = {}) => {
  const {
    allowedDependencies = [],
    ignoreFiles = ['node_modules'],
    dryRun = false,
    resolveWithCwd = false,
    verboseLog = () => {},
    debug = false,
  } = options;

  const {
    declarationFilePaths,
    projectDirPath,
    tsConfigFilePath,
  } = await resolveTargetPaths(target, { ignoreFiles, resolveWithCwd, verboseLog });

  /** @type {Set<string>} */
  let completeIgnoreSet = new Set();

  const debugLog = debug ? verboseLog : () => {};

  verboseLog('Figuring out configuration...', '', '', true);

  const project = new Project({
    tsConfigFilePath,
    addFilesFromTsConfig: false
  });
  project.enableLogging(debug);

  verboseLog('Paths will be relative to:', projectDirPath);
  verboseLog('Using tsconfig file at:', path.relative(projectDirPath, tsConfigFilePath), tsConfigFilePath);

  verboseLog('Adding files...', '', '', true);
  for (const filePath of declarationFilePaths) {
    verboseLog('Adding file:', path.relative(projectDirPath, filePath), filePath);
    try {
      project.addSourceFileAtPath(filePath);
    } catch (err) {
      throw new VError(err, 'Failed to add source file');
    }
  }

  verboseLog('Resolving dependencies...', '', '', true);
  project.resolveSourceFileDependencies();

  verboseLog('Processing files...', '', '', true);
  for (const file of project.getSourceFiles()) {
    /** @type {Set<string>} */
    const ignoreSet = new Set();
    const verboseLogFilename = path.relative(projectDirPath, file.getFilePath());

    verboseLog('Processing:', verboseLogFilename, '', true);
    try {
      while (addIgnore(file, allowedDependencies, ignoreSet, { debugLog }));
    } catch (err) {
      throw new VError(err, `Failed to process ${file.getFilePath()}`);
    }

    const cleanedIgnores = [...ignoreSet].map(item => item.slice(1, -1));

    verboseLog(`Ignored ${cleanedIgnores.length} for:`, verboseLogFilename, cleanedIgnores.join(', '));

    if (cleanedIgnores.length === 0) {
      continue;
    }

    completeIgnoreSet = new Set([...completeIgnoreSet, ...cleanedIgnores]);

    if (dryRun) {
      verboseLog('Saving changes of:', verboseLogFilename, 'skipping due to dry-run', true);
    } else {
      verboseLog('Saving changes of:', verboseLogFilename, '', true);
      file.save();
    }
  }
  verboseLog('Completed processing.', '', '', true);

  return {
    ignored: completeIgnoreSet,
    sourceFileCount: project.getSourceFiles().length
  };
};

module.exports = { addAllIgnores };
