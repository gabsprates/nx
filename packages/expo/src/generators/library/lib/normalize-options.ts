import { readNxJson, Tree } from '@nx/devkit';
import {
  determineProjectNameAndRootOptions,
  ensureProjectName,
} from '@nx/devkit/src/generators/project-name-and-root-utils';
import { Schema } from '../schema';
import { isUsingTsSolutionSetup } from '@nx/js/src/utils/typescript/ts-solution-setup';
import { getImportPath } from '@nx/js/src/utils/get-import-path';

export interface NormalizedSchema extends Schema {
  name: string;
  fileName: string;
  projectName: string;
  projectRoot: string;
  routePath: string;
  parsedTags: string[];
  appMain: string;
  isUsingTsSolutionConfig: boolean;
}

export async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  await ensureProjectName(host, options, 'library');
  const {
    projectName,
    names: projectNames,
    projectRoot,
    importPath,
  } = await determineProjectNameAndRootOptions(host, {
    name: options.name,
    projectType: 'library',
    directory: options.directory,
    importPath: options.importPath,
  });
  const nxJson = readNxJson(host);
  const addPluginDefault =
    process.env.NX_ADD_PLUGINS !== 'false' &&
    nxJson.useInferencePlugins !== false;
  options.addPlugin ??= addPluginDefault;

  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];
  const appMain = options.js ? 'src/index.js' : 'src/index.ts';

  const isUsingTsSolutionConfig = isUsingTsSolutionSetup(host);
  const normalized: NormalizedSchema = {
    ...options,
    fileName: projectName,
    routePath: `/${projectNames.projectSimpleName}`,
    name: projectName,
    projectName: isUsingTsSolutionConfig
      ? getImportPath(host, projectName)
      : projectName,
    projectRoot,
    parsedTags,
    importPath,
    appMain,
    isUsingTsSolutionConfig,
  };

  return normalized;
}
