const Promise = require('sdk/core/promise');
const {TabController} = require("TabManagement");

const {Cu} = require("chrome");
Cu.import("resource://gre/modules/Task.jsm");

exports["test create session"] = function(assert, done) {
  Task.spawn(function() {
    let tabController = new TabController();
    let session_id = yield tabController.createSession();
    assert.notEqual(session_id, null, "session is created and an ID is returned");

    yield tabController.deleteAll();
  }).then(done);
};

exports["test create/delete tab"] = function(assert, done) {
  Task.spawn(function() {
    let tabController = new TabController();
    let session_id = yield tabController.createSession();
    yield tabController.createTab("http://example.com", "I am an Example!", session_id);

    let tabs = yield tabController._storage.getTabsForSessions([session_id]);
    assert.ok(tabs[session_id], "session_id exists");
    assert.equal(tabs[session_id].length, 1, "tab result returned");
    assert.equal(tabs[session_id][0].url, "http://example.com", "tab has been created");

    yield tabController.deleteTab(tabs[session_id][0].id);
    tabs = yield tabController._storage.getTabsForSessions([session_id]);
    assert.ok(tabs[session_id], "session_id still exists");
    assert.equal(tabs[session_id].length, 0, "tab no longer exists");

    yield tabController.deleteAll();
  }).then(done);
};

exports["test deleteGroup"] = function(assert, done) {
  Task.spawn(function() {
    let tabController = new TabController();
    let session_id = yield tabController.createSession();
    yield tabController.createTab("http://example.com", "I am an Example!", session_id);

    let tabs = yield tabController._storage.getTabsForSessions([session_id]);
    let tab_id = tabs[session_id][0].id;

    yield tabController.deleteGroup({grouping: "session", id: session_id, tab_ids: [tab_id]});

    let sessions = yield tabController._storage.getSessions();
    assert.deepEqual(sessions, [], "session no longer exists");
    tabs = yield tabController._storage.getTabsForSessions([session_id]);
    assert.deepEqual(tabs[session_id], [], "tabs don't exist");

    yield tabController.deleteAll();
  }).then(done);
};

require("sdk/test").run(exports);
