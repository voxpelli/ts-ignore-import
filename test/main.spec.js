// @ts-check
/// <reference types="node" />

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const proxyquire = require('proxyquire').noPreserveCache().noCallThru();
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(chaiAsPromised);
chai.use(sinonChai);

const should = chai.should();

describe('ts-ignore-import', () => {
  /** @type {import('..')} */
  let theModule;

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();

    theModule = proxyquire('..', {
      // 'name-of-module-to-be-stubbed': theStubToReplaceItWith
    });
  });

  afterEach(() => {
    sinon.restore();
    if (!nock.isDone()) throw new Error('pending mocks: ' + nock.pendingMocks());
  });

  describe('addAllIgnores()', () => {
    it('should throw when used with default paramaters', async () => {
      const result = theModule.addAllIgnores();
      should.exist(result);
      await result.should.be.rejectedWith(Error, 'Can not figure out where to look for tsconfig.json file');
    });

    it.skip('should work when called with a valid project target', async () => {
      const result = theModule.addAllIgnores({}, {});
      should.exist(result);
      await result.should.be.fulfilled;
    });
  });
});
