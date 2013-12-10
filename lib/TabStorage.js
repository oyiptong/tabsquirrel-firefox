"use strict";

const {Cu,Ci,Cc} = require("chrome");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/Task.jsm");
const eTLDService = Cc["@mozilla.org/network/effective-tld-service;1"]
                        .getService(Ci.nsIEffectiveTLDService);
const {TabDatabase} = require("TabDatabase");

const SQL = {
  createTab:
    "INSERT INTO tabs (url, title, domain_id, session_id) " +
    "VALUES (:url, :title, :domain_id, :session_id)"
  ,

  getTabsForSessions:
    "SELECT id, " +
           "url, " +
           "title, " +
           "session_id " +
    "FROM tabs " +
    "WHERE session_id IN (:session_ids) " +
    "ORDER BY session_id DESC, id DESC"
  ,

  deleteTab:
    "DELETE FROM tabs " +
    "WHERE id = :id"
  ,

  deleteAllTabs:
    "DELETE FROM tabs"
  ,

  deleteAllSessions:
    "DELETE FROM sessions"
  ,

  deleteAllDomains:
    "DELETE FROM domains"
  ,

  getSessions:
    "SELECT id, name, timestamp " +
    "FROM sessions " +
    "ORDER BY id DESC " +
    "LIMIT :limit OFFSET :offset"
  ,

  createSession:
    "INSERT INTO sessions (timestamp) " +
    "VALUES (:timestamp)"
  ,

  lastCreatedSession:
    "SELECT max(id) as id FROM sessions"
  ,

  deleteSession:
    "DELETE FROM sessions " +
    "WHERE id = :id"
  ,

  createDomain:
    "INSERT OR IGNORE INTO domains (name) " +
    "VALUES (:name)"
  ,

  getDomain:
    "SELECT id, name " +
    "FROM domains " +
    "WHERE name = :name"
  ,
}

function TabStorage(connection) {
  this.dbConnection = connection;
}

TabStorage.prototype = {

  createTab: function TS_createTab(url, title, session_id) {
    let uri = NetUtil.newURI(url);
    let baseDomain = eTLDService.getBaseDomain(uri);
    return Task.spawn(function createTabTask() {
      yield this.createDomain(baseDomain);
      let results = yield this.getDomain(baseDomain);
      let domainObj = results[0];
      yield this._execute(SQL.createTab, {
        params: {
          url: url,
          title: title,
          session_id: session_id,
          domain_id: domainObj.id,
        },
      });
    }.bind(this));
  },

  getTabsForSessions: function TS_getTabsForSessions(session_ids) {
    return this._execute(SQL.getTabsForSessions, {
      columns: ["id", "url", "title", "session_id"],
      listParams: {
        session_ids: session_ids,
      },
    });
  },

  deleteTab: function TS_deleteTab(tab_id) {
    return this._execute(SQL.deleteTab, {
      params: {
        id: tab_id,
      },
    });
  },

  deleteAll: function TS_deleteAll() {
    return Task.spawn(function() {
      yield this._execute(SQL.deleteAllTabs);
      yield this._execute(SQL.deleteAllSessions);
      yield this._execute(SQL.deleteAllDomains);
    }.bind(this));
  },

  getSessions: function TS_getSessions(optional={}) {
    let {offset, limit} = optional;
    limit = limit || -1;
    offset = offset || 0;

    return this._execute(SQL.getSessions, {
      columns: ["id", "name", "timestamp"],
      params: {
        limit: limit,
        offset: offset,
      }
    });
  },

  createSession: function TS_createSession() {
    return this.dbConnection.executeTransaction(function(){
      yield this._execute(SQL.createSession, {
        params: {
          timestamp: new Date().getTime(),
        },
      });
      // Not Thread Safe
      let session_id = yield this._execute(SQL.lastCreatedSession, {
        columns: "id",
      });
      if (session_id) {
        session_id = parseInt(session_id);
      }
      throw new Task.Result(session_id);
    }.bind(this));
  },

  deleteSession: function TS_deleteSession(session_id) {
    return this._execute(SQL.deleteSession, {
      params: {
        id: session_id,
      },
    });
  },

  createDomain: function TS_createDomain(name) {
    return this._execute(SQL.createDomain, {
      params: {
        name: name,
      },
    });
  },

  getDomain: function TS_getDomain(name) {
    return this._execute(SQL.getDomain, {
      columns: ["id", "name"],
      params: {
        name: name,
      },
    });
  },

  /**
   * Execute a SQL statement with various options
   *
   * @param   sql
   *          The SQL statement to execute
   * @param   [optional] optional {see below}
   *          columns: Array of column strings to read for array format result
   *          key: Additional column string to trigger object format result
   *          listParams: Object to expand the key to a SQL list
   *          onRow: Function callback given the columns for each row
   *          params: Object of keys matching SQL :param to bind values
   * @returns Promise for when the statement completes with value dependant on
   *          the optional values passed in.
   */
  _execute: function IS__execute(sql, optional={}) {
    let {columns, key, listParams, onRow, params} = optional;

    // Convert listParams into params and the desired number of identifiers
    if (listParams != null) {
      params = params || {};
      Object.keys(listParams).forEach(listName => {
        let listIdentifiers = [];
        for (let i = 0; i < listParams[listName].length; i++) {
          let paramName = listName + i;
          params[paramName] = listParams[listName][i];
          listIdentifiers.push(":" + paramName);
        }

        // Replace the list placeholders with comma-separated identifiers
        sql = sql.replace(":" + listName, listIdentifiers, "g");
      });
    }
    // Determine the type of result as nothing, a keyed object or array of columns
    let results;
    if (onRow != null) {}
    else if (key != null) {
      results = {};
    }
    else if (columns != null) {
      results = [];
    }
    // execute cached sql statement
    return this.dbConnection.executeCached(sql, params, function (row) {
      // Read out the desired columns from the row into an object
      let result;
      if (columns != null) {
        // For just a single column, make the result that column
        if (typeof columns == "string") {
          result = row.getResultByName(columns);
        }
        // For multiple columns, put as valyes on an object
        else {
          result = {};
          columns.forEach(column => {
            result[column] = row.getResultByName(column);
          });
        }
      }

      // Give the packaged result to the handler
      if (onRow != null) {
        onRow(result);
      }
      // Store the result keyed on the result key
      else if (key != null) {
        results[row.getResultByName(key)] = result;
      }
      // Append the result in order
      else if (columns != null) {
        results.push(result);
      }
    }).then(() => {
      return results;
    },
    function(error){
      console.error(error);
      return error;
    });
  },
}

exports.TabStorage = TabStorage;
