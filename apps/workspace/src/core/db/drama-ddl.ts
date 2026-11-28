const now = `(cast((julianday('now') - 2440587.5)*86400000 as integer))`;

/** Additive local tables for M1. Applied when the project table already exists. */
export const dramaTableStatements = [
  `CREATE TABLE IF NOT EXISTS drama_scripts (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    source_kind TEXT NOT NULL DEFAULT 'one_liner',
    source_text TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT ${now},
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
  `CREATE INDEX IF NOT EXISTS drama_scripts_project_idx ON drama_scripts(project_id)`,
  `CREATE TABLE IF NOT EXISTS drama_projects (
    project_id TEXT PRIMARY KEY NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    current_script_id TEXT,
    current_storyboard_id TEXT,
    quality TEXT NOT NULL DEFAULT 'standard',
    aspect_ratio TEXT NOT NULL DEFAULT '9:16',
    cloud_backup_status TEXT NOT NULL DEFAULT 'local',
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
  `CREATE TABLE IF NOT EXISTS drama_characters (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visual_notes TEXT NOT NULL DEFAULT '',
    asset_id TEXT,
    created_at INTEGER NOT NULL DEFAULT ${now},
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
  `CREATE TABLE IF NOT EXISTS drama_scenes (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visual_notes TEXT NOT NULL DEFAULT '',
    asset_id TEXT,
    created_at INTEGER NOT NULL DEFAULT ${now},
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
  `CREATE TABLE IF NOT EXISTS drama_props (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visual_notes TEXT NOT NULL DEFAULT '',
    asset_id TEXT,
    created_at INTEGER NOT NULL DEFAULT ${now},
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
  `CREATE TABLE IF NOT EXISTS drama_storyboards (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    script_id TEXT REFERENCES drama_scripts(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT ${now},
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
  `CREATE TABLE IF NOT EXISTS drama_shots (
    id TEXT PRIMARY KEY NOT NULL,
    storyboard_id TEXT NOT NULL REFERENCES drama_storyboards(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    "index" INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    dialogue TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 4000,
    image_prompt TEXT,
    video_prompt TEXT,
    reference_asset_ids TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    image_asset_id TEXT,
    video_asset_id TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT ${now},
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS drama_shots_storyboard_index ON drama_shots(storyboard_id, "index")`,
  `CREATE TABLE IF NOT EXISTS drama_runs (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'paused',
    cursor TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT ${now},
    updated_at INTEGER NOT NULL DEFAULT ${now}
  )`,
];
