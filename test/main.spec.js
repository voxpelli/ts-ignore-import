import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { addAllIgnores } from '../index.js';

chai.use(chaiAsPromised);

const should = chai.should();

describe('ts-ignore-import', function () {
  describe('addAllIgnores()', () => {
    it('should throw when used with default paramaters', async () => {
      const result = addAllIgnores();
      should.exist(result);
      await result.should.be.rejectedWith(Error, 'Can not figure out where to look for tsconfig.json file');
    });

    it.skip('should work when called with a valid project target', async () => {
      const result = addAllIgnores({}, {});
      should.exist(result);
      await result.should.be.fulfilled;
    });
  });
});
