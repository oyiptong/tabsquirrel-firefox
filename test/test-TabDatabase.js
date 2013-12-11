const {Cu,Ci,Cc} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
const {TabDatabase, DB_VERSION} = require("TabDatabase");

exports["test connection"] = function(assert, done) {
  Task.spawn(function() {
    let connection = yield TabDatabase.DBConnectionPromise;
    let schema_version = yield connection.getSchemaVersion();

    assert.equal(schema_version, DB_VERSION, "DB Schema is at the latest version");
    assert.equal(connection.isMigrated, true, "Table created has succeeded");

    yield connection.execute(
      "INSERT INTO sessions (timestamp, name) VALUES (:timestamp, :name)", 
      {timestamp: new Date().getTime(), name: "test-session"}
    );

    yield connection.execute("SELECT name FROM sessions WHERE id = 1", {}, function(row) {
      assert.notEqual(row, null, "result row is not empty");
      let name = row.getResultByName("name")
      assert.equal(name, "test-session", "session name matches");
    });

    // cleanup
    yield connection.execute("DELETE FROM sessions");
  }).then(done);
};

require("sdk/test").run(exports);
