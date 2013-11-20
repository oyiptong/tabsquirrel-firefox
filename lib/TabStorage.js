"use strict";

const {TabDatabase} = require("TabDatabase");

const SQL = {
  storeTabs:
    "INSERT INTO ",
  getSessions:
    "SELECT ",
  removeTab:
    "DELETE FROM ",
  removeSession:
    "DELETE FROM ",
}

function TabStorage(connection) {
  this.dbConnection = connection;
}

TabStorage.prototype = {

  storeTabs: function TS_storeTabs(tabs) {
  },

  getSessions: function TS_getSessions() {
  },

  removeTab: function TS_deleteTab(tab_id) {
  },

  removeSession: function TS_removeSession(session_id) {
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
    });
  },
}
