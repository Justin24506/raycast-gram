import { execFilePromise } from "./utils";

export type GramBuild = "Gram" | "Gram Dev";

const GramBundleIdBuildMapping: Record<GramBuild, string> = {
  Gram: "app.liten.Gram",
  "Gram Dev": "app.liten.Gram-dev",
};

const GramDbNameMapping: Record<GramBuild, string> = {
  Gram: "0-stable",
  "Gram Dev": "0-dev",
};

export function getGramBundleId(build: GramBuild): string {
  return GramBundleIdBuildMapping[build];
}

export function getGramDbName(build: GramBuild): string {
  return GramDbNameMapping[build];
}

/**
 * Minimum supported WorkspaceDb schema version.
 */
export const MIN_SUPPORTED_DB_VERSION = 30;

/**
 * Query the Gram SQLite database.
 */
export async function queryDb(dbPath: string, query: string): Promise<string> {
  try {
    // Apply `--init /dev/null` to ignore user sqlite configuration
    const result = await execFilePromise("sqlite3", ["--init", "/dev/null", dbPath, query]);

    if (result.stderr) {
      console.error(`Error querying Gram workspace DB: ${result.stderr}`);
      throw new Error(`Error querying Gram workspace DB: ${result.stderr}`);
    }

    return result.stdout.trim();
  } catch (error) {
    console.error(`Error querying Gram workspace DB: ${error}`);
    throw error;
  }
}

/**
 * Get the Gram workspace database schema version.
 * Returns the version number and whether it's supported by this extension.
 */
export async function getGramWorkspaceDbVersion(dbPath: string): Promise<{ version: number; supported: boolean }> {
  try {
    const result = await queryDb(dbPath, "SELECT MAX(step) FROM migrations WHERE domain = 'WorkspaceDb';");
    const version = parseInt(result.trim(), 10);

    if (isNaN(version)) {
      console.error(`Error parsing Gram workspace DB version: ${result}`);
      return { version: 0, supported: false };
    }

    return {
      version,
      supported: version >= MIN_SUPPORTED_DB_VERSION,
    };
  } catch (error) {
    // Gram DB might be temporarily locked during write operation
    if (String(error).includes("Error: in prepare, database is locked")) {
      console.warn("DB is locked, assuming supported version");
      return { version: MIN_SUPPORTED_DB_VERSION, supported: true };
    }

    console.error(`Error getting Gram workspace DB version: ${error}`);
    return { version: 0, supported: false };
  }
}

/**
 * Get the appropriate SQL query for fetching workspaces based on schema version.
 * This allows for future schema changes while maintaining backward compatibility.
 */
export function getGramWorkspacesQuery(dbVersion: number): string {
  // Future schema changes can add new queries here
  if (dbVersion >= MIN_SUPPORTED_DB_VERSION) {
    return GRAM_WORKSPACES_QUERY;
  }

  // Unsupported version - return the latest query anyway
  // The caller should check version support before calling this
  console.warn(`Unsupported DB version ${dbVersion}, using latest query`);
  return GRAM_WORKSPACES_QUERY;
}

/**
 * SQL query to fetch workspaces from Gram DB (v30+).
 *
 * Schema uses remote_connections table for SSH/WSL/container connections.
 * Paths are stored as newline-separated strings with paths_order for ordering.
 *
 * See docs/gram-db.md for full schema documentation.
 */
export const GRAM_WORKSPACES_QUERY = `SELECT
  CASE
    WHEN remote_connection_id IS NULL THEN 'local'
    ELSE 'remote'
  END AS type,
  workspace_id as id,
  paths,
  paths_order,
  timestamp,
  window_id,
  session_id,
  host,
  user,
  port,
  kind,
  distro
FROM workspaces
LEFT JOIN remote_connections ON workspaces.remote_connection_id = remote_connections.id
ORDER BY timestamp DESC`;