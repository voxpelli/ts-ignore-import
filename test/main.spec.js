/* eslint-disable security/detect-non-literal-fs-filename */
import { cp, readFile } from 'node:fs/promises';
import path from 'node:path';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { join } from 'desm';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { temporaryDirectoryTask } from 'tempy';

import { addAllIgnores } from '../index.js';

chai.use(chaiAsPromised);
chai.use(sinonChai);

const should = chai.should();

describe('ts-ignore-import', function () {
  afterEach(() => {
    sinon.restore();
  });

  it('should throw when used with default paramaters', async () => {
    const result = addAllIgnores();
    should.exist(result);
    await result.should.be.rejectedWith(Error, 'Can not figure out where to look for tsconfig.json file');
  });

  it('should throw when tsconfig.json can not be figured out', async () => {
    await temporaryDirectoryTask(async (tmpDir) => {
      await cp(join(import.meta.url, 'fixtures/no-tsconfig'.replaceAll('/', path.sep)), tmpDir, { recursive: true });

      return addAllIgnores({
        // Always use forward-slashes in glob patterns: https://github.com/mrmlnc/fast-glob?tab=readme-ov-file#pattern-syntax
        declarationFilePaths: [path.posix.join(tmpDir.replaceAll(path.sep, '/'), '**/*.d.ts')],
      });
    })
      .should.be.rejectedWith(Error, 'Can not figure out where to look for tsconfig.json file');
  });

  it('should apply ignores', async () => {
    const logSpy = sinon.spy();

    await temporaryDirectoryTask(async (tmpDir) => {
      await cp(join(import.meta.url, 'fixtures/basic'.replaceAll('/', path.sep)), tmpDir, { recursive: true });
      const filePath = path.join(tmpDir, 'index.d.ts');

      await addAllIgnores({
        declarationFilePaths: [path.posix.join(tmpDir.replaceAll(path.sep, '/'), '**/*.d.ts')],
        tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      }, {
        debug: true,
        verboseLog: logSpy,
      });

      const changedFile = await readFile(filePath, { encoding: 'utf8' });
      changedFile.replaceAll('\r\n', '\n').should.equal(
        'export type Foo = \n' +
        '// @ts-ignore\n' +
        'import(\'read-pkg\').NormalizedPackageJson;\n'
      );
    });

    logSpy.should.have.been.calledWith('Ignored 1 for:', 'index.d.ts', 'read-pkg');
  });

  it('should respect dry-run');

  it('should respect existing ignores', async () => {
    const logSpy = sinon.spy();

    await temporaryDirectoryTask(async (tmpDir) => {
      await cp(join(import.meta.url, 'fixtures/respect-existing-line-ignore'.replaceAll('/', path.sep)), tmpDir, { recursive: true });
      const filePath = path.join(tmpDir, 'index.d.ts');

      const originalFile = await readFile(filePath, { encoding: 'utf8' });

      await addAllIgnores({
        declarationFilePaths: [path.posix.join(tmpDir.replaceAll(path.sep, '/'), '**/*.d.ts')],
        tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
      }, {
        verboseLog: logSpy,
      });

      const changedFile = await readFile(filePath, { encoding: 'utf8' });

      changedFile.should.equal(originalFile);
    });

    logSpy.should.have.been.calledWith('Ignored 1 for:', 'index.d.ts', 'read-pkg');
  });

  describe('bug fixes', () => {
    it('should not fail on ignoring initial code line when preceded by comment', async () => {
      const logSpy = sinon.spy();

      await temporaryDirectoryTask(async (tmpDir) => {
        await cp(join(import.meta.url, 'fixtures/jsdoc-in-type-declaration'.replaceAll('/', path.sep)), tmpDir, { recursive: true });
        const filePath = path.join(tmpDir, 'index.d.ts');

        await addAllIgnores({
          declarationFilePaths: [path.posix.join(tmpDir.replaceAll(path.sep, '/'), '**/*.d.ts')],
          tsConfigFilePath: path.join(tmpDir, 'tsconfig.json'),
        }, {
          verboseLog: logSpy,
        });

        const changedFile = await readFile(filePath, { encoding: 'utf8' });
        changedFile.replaceAll('\r\n', '\n').should.equal(
`/**
 */

// @ts-ignore
export function convertTsExtensionToJs(context: import('eslint').Rule.RuleContext): string;
`
        );
      });

      logSpy.should.have.been.calledWith('Ignored 1 for:', 'index.d.ts', 'eslint');
    });
  });
});
