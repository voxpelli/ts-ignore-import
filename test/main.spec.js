/* eslint-disable security/detect-non-literal-fs-filename */
import { cp, readFile } from 'node:fs/promises';

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
      await cp(join(import.meta.url, 'fixtures/no-tsconfig'), tmpDir, { recursive: true });

      return addAllIgnores({
        declarationFilePaths: [`${tmpDir}/**/*.d.ts`],
      });
    })
      .should.be.rejectedWith(Error, 'Can not figure out where to look for tsconfig.json file');
  });

  it('should apply ignores', async () => {
    const logSpy = sinon.spy();

    await temporaryDirectoryTask(async (tmpDir) => {
      await cp(join(import.meta.url, 'fixtures/basic'), tmpDir, { recursive: true });

      await addAllIgnores({
        declarationFilePaths: [`${tmpDir}/**/*.d.ts`],
        tsConfigFilePath: `${tmpDir}/tsconfig.json`,
      }, {
        // verboseLog: console.log.bind(console),
        verboseLog: logSpy,
      });

      const changedFile = await readFile(`${tmpDir}/index.d.ts`, { encoding: 'utf8' });
      changedFile.should.equal(
        'export type Foo = \n' +
        '// @ts-ignore\n' +
        'import(\'read-pkg\').NormalizedPackageJson;\n'
      );
    });

    logSpy.should.have.been.calledWith('Ignored 1 for:', 'index.d.ts', 'read-pkg');
  });

  it('should respect dry-run');

  describe('bug fixes', () => {
    it('should not fail on ignoring initial code line when preceded by comment', async () => {
      const logSpy = sinon.spy();

      await temporaryDirectoryTask(async (tmpDir) => {
        await cp(join(import.meta.url, 'fixtures/jsdoc-in-type-declaration'), tmpDir, { recursive: true });

        await addAllIgnores({
          declarationFilePaths: [`${tmpDir}/**/*.d.ts`],
          tsConfigFilePath: `${tmpDir}/tsconfig.json`,
        }, {
          // verboseLog: console.log.bind(console),
          verboseLog: logSpy,
        });

        const changedFile = await readFile(`${tmpDir}/index.d.ts`, { encoding: 'utf8' });
        changedFile.should.equal(
`/**
 */
export function convertTsExtensionToJs(context:${' '}
// @ts-ignore
import('eslint').Rule.RuleContext): string;
`
        );
      });

      logSpy.should.have.been.calledWith('Ignored 1 for:', 'index.d.ts', 'eslint');
    });
  });
});
