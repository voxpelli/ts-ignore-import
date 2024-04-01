// @ts-check
/// <reference types="node" />

'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const theModule = require('../index.js');

chai.use(chaiAsPromised);

const should = chai.should();

describe('ts-ignore-import', function () {
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
