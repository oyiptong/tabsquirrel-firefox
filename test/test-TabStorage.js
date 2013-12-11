const {Cu,Ci,Cc} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
const {TabDatabase} = require("TabDatabase");
const {TabStorage} = require("TabStorage");

exports["test session create/delete"] = function(assert, done) {
  Task.spawn(function() {
    let connection = yield TabDatabase.DBConnectionPromise;
    let tabStorage = new TabStorage(connection);
    let session_id = yield tabStorage.createSession();
    let sessions = yield tabStorage.getSessions();
    assert.equal(sessions.length, 1, "session has been created");
    assert.equal(sessions[0].id, session_id, "session obtained matches session created");

    yield tabStorage.deleteSession(session_id);
    sessions = yield tabStorage.getSessions();
    assert.equal(sessions.length, 0, "no sessions obtained after deletion");

    yield tabStorage.deleteAll();
  }).then(done);
};

exports["test get session"] = function(assert, done) {
  Task.spawn(function() {
    let connection = yield TabDatabase.DBConnectionPromise;
    let tabStorage = new TabStorage(connection);

    let session_ids = [];
    let num_sessions = 5;
    for(let i=0; i < num_sessions; i++) {
      let session_id = yield tabStorage.createSession();
      session_ids.push(session_id);
    }
    assert.equal(session_ids.length, num_sessions);

    let sessions;

    sessions = yield tabStorage.getSessions();
    assert.equal(sessions.length, num_sessions, "getSessions catches all sessions created");

    sessions = yield tabStorage.getSessions({limit: 1});
    assert.equal(sessions.length, 1, "limit of 1 only returns 1 element");

    sessions = yield tabStorage.getSessions({offset: 1});
    assert.equal(sessions.length, num_sessions-1, "offset of one ignores the first element");

    sessions = yield tabStorage.getSessions({offset: 1, limit: 1});
    assert.equal(sessions[0].id, session_ids[num_sessions-2], "id obtained is the second-to-last sessionc reated");

    yield tabStorage.deleteAll();
  }).then(done);
};

exports["test domain create/get"] = function(assert, done) {
  Task.spawn(function() {
    let connection = yield TabDatabase.DBConnectionPromise;
    let tabStorage = new TabStorage(connection);

    let domain_name = "example.com";

    let domain_id = yield tabStorage.createDomain(domain_name);
    assert.notEqual(domain_id, null);

    let domain;
    domain = yield tabStorage.getDomainByName("idontexist.com");
    assert.equal(domain, null);

    domain = yield tabStorage.getDomainByName(domain_name);
    assert.notEqual(domain, null);
    assert.equal(domain.id, domain_id);

    assert.equal(domain.name, domain_name, "domain object name matches");
    assert.equal(typeof(domain.id), "number", "domain object id exists");

    yield tabStorage.deleteAll();
  }).then(done);
};

exports["test tab create/get"] = function(assert, done) {
  Task.spawn(function() {
    let connection = yield TabDatabase.DBConnectionPromise;
    let tabStorage = new TabStorage(connection);

    // session urls
    let session_data_1 = [
      {url: "https://mail.mozilla.org/zimbra", title: "Mozilla Mail"},
      {url: "https://developer.mozilla.org/", title: "Mozilla Developer Network"},
      {url: "https://www.reddit.com/", title: "The front page of the web"},
      {url: "https://www.techmeme.com/", title: "Techmeme"},
    ];
    let session_data_2 = [
      {url: "https://www.techcrunch.com/", title: "The latest technology news and information on startups"},
      {url: "https://news.ycombinator.com/", title: "Hacker News"},
    ];

    // create tabs
    let session_id_1 = yield tabStorage.createSession();
    for each (let d in session_data_1) {
      yield tabStorage.createTab(d.url, d.title, session_id_1);
    }
    let session_id_2 = yield tabStorage.createSession();
    for each (let d in session_data_2) {
      yield tabStorage.createTab(d.url, d.title, session_id_2);
    }

    let results;
    // get by session id
    results = yield tabStorage.getTabsForSessions([session_id_1]);
    assert.equal(results.length, session_data_1.length);
    results = yield tabStorage.getTabsForSessions([session_id_2]);
    assert.equal(results.length, session_data_2.length);
    results = yield tabStorage.getTabsForSessions([session_id_1, session_id_2]);
    assert.equal(results.length, session_data_1.length+session_data_2.length);

    yield tabStorage.deleteAll();
  }).then(done);
};

exports["test tab delete"] = function(assert, done) {
  Task.spawn(function() {
    let connection = yield TabDatabase.DBConnectionPromise;
    let tabStorage = new TabStorage(connection);

    // session urls
    let session_data_1 = [
      {url: "https://mail.mozilla.org/zimbra", title: "Mozilla Mail"},
      {url: "https://developer.mozilla.org/", title: "Mozilla Developer Network"},
      {url: "https://www.reddit.com/", title: "The front page of the web"},
      {url: "https://www.techmeme.com/", title: "Techmeme"},
    ];

    // create tabs
    let session_id_1 = yield tabStorage.createSession();
    for each (let d in session_data_1) {
      yield tabStorage.createTab(d.url, d.title, session_id_1);
    }

    let results;
    results = yield tabStorage.getTabsForSessions([session_id_1]);
    assert.equal(results.length, session_data_1.length);
    yield tabStorage.deleteTab(results[0].id);
    results = yield tabStorage.getTabsForSessions([session_id_1]);
    assert.equal(results.length, session_data_1.length-1);

    yield tabStorage.deleteAll();
  }).then(done);
};

require("sdk/test").run(exports);
