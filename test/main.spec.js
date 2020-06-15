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

describe('Do Your Thing', () => {
  /** @type {import('..')} */
  let doYourThingModule;

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();

    doYourThingModule = proxyquire('..', {
      // 'name-of-module-to-be-stubbed': theStubToReplaceItWith
    });
  });

  afterEach(() => {
    sinon.restore();
    if (!nock.isDone()) throw new Error('pending mocks: ' + nock.pendingMocks());
  });

  describe('basic', () => {
    it('should throw when called without core parameter', async () => {
      // @ts-ignore
      const result = doYourThingModule.doYourThing({});
      should.exist(result);
      await result.should.be.rejectedWith(TypeError);
    });

    it('should work when called with core parameter', async () => {
      const result = doYourThingModule.doYourThing({
        stuffDerivedFromInput: 3
      });
      should.exist(result);
      await result.should.be.fulfilled;
    });
  });
});
