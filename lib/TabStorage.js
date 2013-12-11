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
    "SELECT id, url, title, session_id, domain_id " +
    "FROM tabs " +
    "WHERE session_id IN (:session_ids) " +
    "ORDER BY session_id DESC, id DESC"
  ,

  deleteTabs:
    "DELETE FROM tabs " +
    "WHERE id in (:ids)"
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

  lastCreatedDomain:
    "SELECT max(id) as id FROM domains"
  ,

  getDomainByName:
    "SELECT id, name " +
    "FROM domains " +
    "WHERE name = :name"
  ,
}

function TabStorage(connection) {
  this.dbConnection = connection;
}

TabStorage.prototype = {

  /*
   * Create a tab
   * @param url        a URL
   * @param title      a web page title
   * @param session_id a browsing session id, obtained by creating a session
   */
  createTab: function TS_createTab(url, title, session_id) {
    let uri = NetUtil.newURI(url);
    let baseDomain = eTLDService.getBaseDomain(uri);
    return Task.spawn(function createTabTask() {
      yield this.createDomain(baseDomain);
      let domainObj = yield this.getDomainByName(baseDomain);
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

  /*
   * Given a list of session ids, return a list of tabs, separated by session_id's
   * @param session_ids        an array of session ids
   * @returns                   an object with session ids as keys, and a tab array for each key
   */
  getTabsForSessions: function TS_getTabsForSessions(session_ids) {
    return Task.spawn(function() {
      let results = yield this._execute(SQL.getTabsForSessions, {
        columns: ["id", "url", "title", "session_id", "domain_id"],
        listParams: {
          session_ids: session_ids,
        },
      });

      let tabData = {};
      for each (let id in session_ids) {
        tabData[id] = [];
      }

      for each(let result in results) {
        tabData[result.session_id].push(result);
      }

      throw new Task.Result(tabData);
    }.bind(this));
  },

  /*
   * Delete the data corresponding to the given tab ids
   * @param tab_ids      an array of tab ids
   */
  deleteTabs: function TS_deleteTabs(tab_ids) {
    return this._execute(SQL.deleteTabs, {
      listParams: {
        ids: tab_ids,
      },
    });
  },

  /*
   * Delete data in all tables
   */
  deleteAll: function TS_deleteAll() {
    return Task.spawn(function() {
      yield this._execute(SQL.deleteAllTabs);
      yield this._execute(SQL.deleteAllSessions);
      yield this._execute(SQL.deleteAllDomains);
    }.bind(this));
  },

  /*
   * Obtain a reverse-chronological list of browsing sessions
   * @param optional.offset     an offset to start returning results by
   * @param optional.limit      the number to limit the results by
   */
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

  /*
   * Create a browsing session
   * @returns returns the created session's id
   */
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

  /*
   * Delete a session given an id
   * @param session_id   a session id
   */
  deleteSession: function TS_deleteSession(session_id) {
    return this._execute(SQL.deleteSession, {
      params: {
        id: session_id,
      },
    });
  },

  /*
   * Create a domain entry
   * @param name        a domain name entry to create
   * @returns           the created domain's id
   */
  createDomain: function TS_createDomain(name) {
    return Task.spawn(function() {
      yield this._execute(SQL.createDomain, {
        params: {
          name: name,
        },
      });

      // Not Thread Safe
      let domain_id = yield this._execute(SQL.lastCreatedDomain, {
        columns: "id",
      });
      if (domain_id) {
        domain_id = parseInt(domain_id);
      }
      throw new Task.Result(domain_id);
    }.bind(this));
  },

  /*
   * Return a domain given a name
   * @param name        a domain name
   * @returns           a domain object
   */
  getDomainByName: function TS_getDomainByName(name) {
    return Task.spawn(function() {
      let results = yield this._execute(SQL.getDomainByName, {
        columns: ["id", "name"],
        params: {
          name: name,
        },
      });
      let output = results.length ? results[0] : null;
      throw new Task.Result(output)
    }.bind(this));
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
