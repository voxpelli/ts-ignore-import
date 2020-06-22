// @ts-check
/// <reference types="node" />

'use strict';

const path = require('path');
const pkgDir = require('pkg-dir');
const { Project, ts } = require('ts-morph');
const VError = require('verror');

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
 * @typedef AddIgnoresOptions
 * @property {string[]|undefined} [allowedDependencies]
 * @property {string[]|undefined} [declarationFilePaths]
 * @property {boolean} [dryRun]
 * @property {VerboseLog} [verboseLog]
 * @property {string|undefined} [projectDirPath]
 * @property {string|undefined} [tsConfigFilePath]
 */

/**
 * @param {AddIgnoresOptions} options
 * @returns {Promise<Set<string>>}
 */
const addAllIgnores = async (options) => {
  const {
    allowedDependencies = [],
    declarationFilePaths = ['index.d.ts'],
    dryRun = false,
    verboseLog = () => {},
  } = options;

  let {
    tsConfigFilePath,
    projectDirPath,
  } = options;

  /** @type {Set<string>} */
  let completeIgnoreSet = new Set();

  verboseLog('', '', 'Figuring out configuration...');

  if (!tsConfigFilePath) {
    if (!projectDirPath && declarationFilePaths[0] && path.isAbsolute(declarationFilePaths[0])) {
      projectDirPath = path.dirname(declarationFilePaths[0]);
    }
    if (!projectDirPath && require.main) {
      projectDirPath = await pkgDir(require.main.filename);
    }
    if (projectDirPath) {
      tsConfigFilePath = path.resolve(projectDirPath, './tsconfig.json');
    }
  }
  if (!tsConfigFilePath) throw new Error('Can not figure out where to look for tsconfig.json file');
  if (!projectDirPath) {
    projectDirPath = path.dirname(tsConfigFilePath);
  }

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
