"use strict";

const {Cu,Ci} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Sqlite.jsm");

const Promise = require('sdk/core/promise');

const DB_VERSION = 1;

const SCHEMA = {
  tables : {
    tabs :
      "CREATE TABLE tabs (" +
      "  id INTEGER PRIMARY KEY" +
      ", session_id INTEGER NOT NULL" +
      ", domain_id INTEGER NOT NULL" +
      ", url TEXT NOT NULL" +
      ", title TEXT NOT NULL" +
      ", FOREIGN KEY(session_id) REFERENCES sessions(id)" +
      ", FOREIGN KEY(domain_id) REFERENCES domains(id)" +
      ")"
    ,
    sessions :
      "CREATE TABLE sessions (" +
      "  id INTEGER PRIMARY KEY" +
      ", timestamp INTEGER NOT NULL" +
      ", name TEXT" +
      ")"
    ,
    domains :
      "CREATE TABLE domains (" +
      "  id INTEGER PRIMARY KEY" +
      ", name TEXT UNIQUE" +
      ")"
    ,
  },
  indices : {
    squirrel_domains_name_index : {
      table   : "domains",
      columns : ["name"]
    },
    squirrel_sessions_timestamp_index : {
      table   : "sessions",
      columns : ["timestamp"]
    },
  }
};

let TabDatabase = {

  //////////////////////////////////////////////////////////////////////////////
  //// Fields

  // Sqlite connection
  _dbConnectionPromise: null,

  //////////////////////////////////////////////////////////////////////////////
  //// Public API

  /**
   * Opens and caches new connection
   *
   * @returns Promise resulting in an established connection
  */
  get DBConnectionPromise() {
    if (this._dbConnectionPromise == null) {
      this._dbConnectionPromise = this._openDatabaseConnection();
    }
    return this._dbConnectionPromise;
  },

  /**
   * returns a promise resolved to migration flag
   *
   * @returns Promise resolving to true upon creation or migration
  */
  getDbMigrationPromise: function TD_getDbMigrationPromise() {
    return this._dbMigrationPromiseDeferred.promise;
  },

  //////////////////////////////////////////////////////////////////////////////
  //// Helpers

  /**
   * Opens a Sqlite connection to tabsquirrel database
   *
   * @returns Promise resulting in an established connection
  */
  _openDatabaseConnection: function TD__openDatabaseConnection() {
    let dbFile = Services.dirsvc.get("ProfD", Ci.nsIFile).clone();
    dbFile.append("tabsquirrel.sqlite");

    return Task.spawn(function () {
      let connection = yield Sqlite.openConnection({
         path: dbFile.path,
         sharedMemoryCache: false,
      });

      try {
        connection.isMigrated = yield this._dbInit(connection);
      }
      catch (ex) {
        yield connection.close();
        throw ex;
      }

      // Be sure to cleanly close this connection.
      Services.obs.addObserver(function DBCloseCallback(aSubject, aTopic, aData) {
        Services.obs.removeObserver(DBCloseCallback, aTopic);
        connection.close();
      }, "profile-change-teardown", false);

      throw new Task.Result(connection);
    }.bind(this));
  },


  /*
   * Attempts to popuate or migrate a database
   *
   * @param   connection
   *          an established connection
   * @returns Promise of completion resolved to migration/creation flag
   */
  _dbInit: function TD__dbInit(connection) {
    return connection.getSchemaVersion().then(version => {
      if (version == 0) {
        return this._dbCreate(connection).then(() => {
          return true;
        });
      }
      else if (version != DB_VERSION) {
        return this._dbMigrate(connection,version).then(() => {
          return true;
        });
      }
      else {
        return false;
      }
    });
  },

  /*
   * Creates Schema tables and indexes
   *
   * @param   connection
   *          an established connection
   * @returns Promise of the task completion
   */
  _dbCreate: function TD__dbCreate(connection) {
    let promises = [];
    for (let name in SCHEMA.tables) {
      let statement = SCHEMA.tables[name];
      promises.push(connection.execute(statement));
    }

    for (let name in SCHEMA.indices) {
      let index = SCHEMA.indices[name];
      let statement = "CREATE INDEX IF NOT EXISTS " + name + " ON " + index.table +
              "(" + index.columns.join(", ") + ")";
      promises.push(connection.execute(statement));
    }
    promises.push(connection.setSchemaVersion(DB_VERSION));
    return Promise.promised(Array)(promises).then();
  },

  /*
   * Migrates database
   *
   * @param   connection
   *          an established connection
   * @param   version
   *          old version of database
   * @returns Promise of the task completion
   *          currently resolves immediately
   */
  _dbMigrate: function TD__dbMigrate(connection,version) {
     let deferred = Promise.defer();
     deferred.resolve(connection);
     return deferred.promise;
   },
}

exports.TabDatabase = TabDatabase;
