import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

export class DatabaseService {
  private static instance: DatabaseService;
  public db: Database.Database;

  private constructor() {
    const dbPath = path.join(app.getPath('userData'), 'telegallery.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public init() {
    this.runMigrations();
  }

  private runMigrations() {
    const migrations = [
      // v1: Initial schema
      () => {
        this.transaction(() => {
          this.db.exec(`
            CREATE TABLE photos (
              id TEXT PRIMARY KEY,
              filename TEXT,
              date_taken INTEGER,
              date_uploaded INTEGER,
              file_id TEXT,
              thumb_file_id TEXT,
              size_bytes INTEGER,
              width INTEGER,
              height INTEGER,
              is_favorite INTEGER DEFAULT 0,
              is_deleted INTEGER DEFAULT 0,
              telegram_message_id INTEGER,
              local_thumb_path TEXT
            );

            CREATE TABLE albums (
              id TEXT PRIMARY KEY,
              name TEXT,
              description TEXT,
              cover_photo_id TEXT,
              created_at INTEGER,
              updated_at INTEGER
            );

            CREATE TABLE photo_albums (
              photo_id TEXT,
              album_id TEXT,
              PRIMARY KEY (photo_id, album_id)
            );

            CREATE TABLE sync_state (
              key TEXT PRIMARY KEY,
              value TEXT
            );

            CREATE INDEX idx_photos_date_taken ON photos(date_taken);
            CREATE INDEX idx_photos_is_favorite ON photos(is_favorite);
            CREATE INDEX idx_photos_is_deleted ON photos(is_deleted);
          `);
        })();
      },
      // v2: Add deleted_at column to photos
      () => {
        this.transaction(() => {
          this.db.exec(`
            ALTER TABLE photos ADD COLUMN deleted_at INTEGER;
            CREATE INDEX idx_photos_deleted_at ON photos(deleted_at);
          `);
        })();
      },
      // v3: Add video_duration_sec column
      () => {
        this.transaction(() => {
          this.db.exec(`
            ALTER TABLE photos ADD COLUMN video_duration_sec INTEGER DEFAULT 0;
          `);
        })();
      }
    ];

    let userVersion = this.db.pragma('user_version', { simple: true }) as number;

    if (userVersion < migrations.length) {
      console.log(`Migrating database from version ${userVersion} to ${migrations.length}...`);
      
      try {
        for (let i = userVersion; i < migrations.length; i++) {
          console.log(`Running migration v${i + 1}...`);
          migrations[i]();
          this.db.pragma(`user_version = ${i + 1}`);
        }
        console.log('Database migrations completed successfully.');
      } catch (error) {
        console.error('Database migration failed:', error);
        throw error;
      }
    }
  }

  /**
   * Executes a statement (INSERT, UPDATE, DELETE).
   */
  public run(sql: string, ...params: any[]): Database.RunResult {
    try {
      return this.db.prepare(sql).run(...params);
    } catch (error) {
      console.error('DB Run Error:', error, 'SQL:', sql, 'Params:', params);
      throw error;
    }
  }

  /**
   * Retrieves all rows from a query.
   */
  public all<T>(sql: string, ...params: any[]): T[] {
    try {
      return this.db.prepare(sql).all(...params) as T[];
    } catch (error) {
      console.error('DB All Error:', error, 'SQL:', sql, 'Params:', params);
      throw error;
    }
  }

  /**
   * Retrieves a single row from a query.
   */
  public get<T>(sql: string, ...params: any[]): T | undefined {
    try {
      return this.db.prepare(sql).get(...params) as T | undefined;
    } catch (error) {
      console.error('DB Get Error:', error, 'SQL:', sql, 'Params:', params);
      throw error;
    }
  }

  /**
   * Wraps a function in an SQLite transaction.
   */
  public transaction<F extends (...args: any[]) => any>(fn: F): F {
    return this.db.transaction(fn) as unknown as F;
  }

  /**
   * Closes the database connection.
   */
  public close() {
    this.db.close();
  }
}
