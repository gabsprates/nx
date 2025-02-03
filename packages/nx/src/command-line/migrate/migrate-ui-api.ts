import { execSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { MigrationDetailsWithId } from '../../config/misc-interfaces';
import { FileChange } from '../../generators/tree';
import {
  getImplementationPath as getMigrationImplementationPath,
  nxCliPath,
  readMigrationCollection,
} from './migrate';

export type MigrationsJsonMetadata = {
  completedMigrations?: Record<
    string,
    SuccessfulMigration | FailedMigration | SkippedMigration
  >;
  runningMigrations?: string[];
  initialGitRef?: {
    ref: string;
    subject: string;
  };
  confirmedPackageUpdates?: boolean;
  targetVersion?: string;
};

export type SuccessfulMigration = {
  type: 'successful';
  name: string;
  changedFiles: Omit<FileChange, 'content'>[];
};

export type FailedMigration = {
  type: 'failed';
  name: string;
  error: string;
};

export type SkippedMigration = {
  type: 'skipped';
};

export function recordInitialMigrationMetadata(
  workspacePath: string,
  versionToMigrateTo: string
) {
  const migrationsJsonPath = join(workspacePath, 'migrations.json');
  const parsedMigrationsJson = JSON.parse(
    readFileSync(migrationsJsonPath, 'utf-8')
  );

  const gitRef = execSync('git rev-parse HEAD', {
    cwd: workspacePath,
    encoding: 'utf-8',
  }).trim();

  const gitSubject = execSync('git log -1 --pretty=%s', {
    cwd: workspacePath,
    encoding: 'utf-8',
  }).trim();

  parsedMigrationsJson['nx-console'] = {
    initialGitRef: {
      ref: gitRef,
      subject: gitSubject,
    },
    targetVersion: versionToMigrateTo,
  };

  writeFileSync(
    migrationsJsonPath,
    JSON.stringify(parsedMigrationsJson, null, 2)
  );
}

export function finishMigrationProcess(
  workspacePath: string,
  squashCommits: boolean,
  commitMessage: string
) {
  const migrationsJsonPath = join(workspacePath, 'migrations.json');
  const parsedMigrationsJson = JSON.parse(
    readFileSync(migrationsJsonPath, 'utf-8')
  );
  const initialGitRef = parsedMigrationsJson['nx-console'].initialGitRef;

  if (existsSync(migrationsJsonPath)) {
    rmSync(migrationsJsonPath);
  }
  execSync('git add .', {
    cwd: workspacePath,
    encoding: 'utf-8',
  });

  execSync(`git commit -m "${commitMessage}" --no-verify`, {
    cwd: workspacePath,
    encoding: 'utf-8',
  });

  if (squashCommits && initialGitRef) {
    execSync(`git reset --soft ${initialGitRef}`, {
      cwd: workspacePath,
      encoding: 'utf-8',
    });

    execSync(`git commit -m "${commitMessage}" --no-verify`, {
      cwd: workspacePath,
      encoding: 'utf-8',
    });
  }
}

export async function runSingleMigration(
  workspacePath: string,
  migration: MigrationDetailsWithId,
  configuration: {
    createCommits: boolean;
  }
) {
  try {
    modifyMigrationsJsonMetadata(
      workspacePath,
      addRunningMigration(migration.id)
    );

    const gitRefBefore = execSync('git rev-parse HEAD', {
      cwd: workspacePath,
      encoding: 'utf-8',
    }).trim();

    const cliPath = nxCliPath(workspacePath);
    const updatedMigrateLocation = resolve(
      cliPath,
      '..',
      '..',
      'nx',
      'src',
      'command-line',
      'migrate',
      'migrate.js'
    );

    const updatedMigrateModule: typeof import('./migrate') = await import(
      updatedMigrateLocation
    );

    const fileChanges = await updatedMigrateModule.runNxOrAngularMigration(
      workspacePath,
      migration,
      false,
      configuration.createCommits,
      'chore: [nx migration] ',
      undefined,
      true
    );

    const gitRefAfter = execSync('git rev-parse HEAD', {
      cwd: workspacePath,
      encoding: 'utf-8',
    }).trim();

    modifyMigrationsJsonMetadata(
      workspacePath,
      addSuccessfulMigration(
        migration.id,
        fileChanges.map((change) => ({
          path: change.path,
          type: change.type,
        }))
      )
    );

    if (gitRefBefore !== gitRefAfter) {
      execSync('git add migrations.json', {
        cwd: workspacePath,
        encoding: 'utf-8',
      });
      execSync('git commit --amend --no-verify --no-edit', {
        cwd: workspacePath,
        encoding: 'utf-8',
      });
    }
  } catch (e) {
    modifyMigrationsJsonMetadata(
      workspacePath,
      addFailedMigration(migration.id, e.message)
    );
  } finally {
    modifyMigrationsJsonMetadata(
      workspacePath,
      removeRunningMigration(migration.id)
    );
  }
}

export async function getImplementationPath(
  workspacePath: string,
  migration: MigrationDetailsWithId
) {
  const { collection, collectionPath } = readMigrationCollection(
    migration.package,
    workspacePath
  );

  const { path } = getMigrationImplementationPath(
    collection,
    collectionPath,
    migration.name
  );

  return path;
}

export function modifyMigrationsJsonMetadata(
  workspacePath: string,
  modify: (
    migrationsJsonMetadata: MigrationsJsonMetadata
  ) => MigrationsJsonMetadata
) {
  const migrationsJsonPath = join(workspacePath, 'migrations.json');
  const migrationsJson = JSON.parse(readFileSync(migrationsJsonPath, 'utf-8'));
  migrationsJson['nx-console'] = modify(migrationsJson['nx-console']);
  writeFileSync(migrationsJsonPath, JSON.stringify(migrationsJson, null, 2));
}

export function addSuccessfulMigration(
  id: string,
  fileChanges: Omit<FileChange, 'content'>[]
) {
  return (
    migrationsJsonMetadata: MigrationsJsonMetadata
  ): MigrationsJsonMetadata => {
    const copied = { ...migrationsJsonMetadata };
    if (!copied.completedMigrations) {
      copied.completedMigrations = {};
    }
    copied.completedMigrations = {
      ...copied.completedMigrations,
      [id]: {
        type: 'successful',
        name: id,
        changedFiles: fileChanges,
      },
    };
    return copied;
  };
}

export function addFailedMigration(id: string, error: string) {
  return (migrationsJsonMetadata: MigrationsJsonMetadata) => {
    const copied = { ...migrationsJsonMetadata };
    if (!copied.completedMigrations) {
      copied.completedMigrations = {};
    }
    copied.completedMigrations = {
      ...copied.completedMigrations,
      [id]: {
        type: 'failed',
        name: id,
        error,
      },
    };
    return copied;
  };
}

export function addSkippedMigration(id: string) {
  return (migrationsJsonMetadata: MigrationsJsonMetadata) => {
    const copied = { ...migrationsJsonMetadata };
    if (!copied.completedMigrations) {
      copied.completedMigrations = {};
    }
    copied.completedMigrations = {
      ...copied.completedMigrations,
      [id]: {
        type: 'skipped',
      },
    };
    return copied;
  };
}

function addRunningMigration(id: string) {
  return (migrationsJsonMetadata: MigrationsJsonMetadata) => {
    migrationsJsonMetadata.runningMigrations = [
      ...(migrationsJsonMetadata.runningMigrations ?? []),
      id,
    ];
    return migrationsJsonMetadata;
  };
}

function removeRunningMigration(id: string) {
  return (migrationsJsonMetadata: MigrationsJsonMetadata) => {
    migrationsJsonMetadata.runningMigrations =
      migrationsJsonMetadata.runningMigrations?.filter((n) => n !== id);
    if (migrationsJsonMetadata.runningMigrations?.length === 0) {
      delete migrationsJsonMetadata.runningMigrations;
    }
    return migrationsJsonMetadata;
  };
}

export function readMigrationsJsonMetadata(
  workspacePath: string
): MigrationsJsonMetadata {
  const migrationsJsonPath = join(workspacePath, 'migrations.json');
  const migrationsJson = JSON.parse(readFileSync(migrationsJsonPath, 'utf-8'));
  return migrationsJson['nx-console'];
}
