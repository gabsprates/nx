import type { Tree } from '@nx/devkit';
import { createTreeWithNestApplication } from '../utils/testing';
import { filterGenerator } from './filter';

describe('filter generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithNestApplication('api');
  });

  it('should run successfully', async () => {
    await expect(
      filterGenerator(tree, { path: 'api/test' })
    ).resolves.not.toThrow();
  });
});
