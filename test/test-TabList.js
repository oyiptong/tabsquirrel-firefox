const simplePrefs = require("simple-prefs");
const {Tab, TabList} = require("TabManagement");
const {Prefs} = require("Preferences");

exports["test init"] = function(assert) {
  let tabList;
 
  tabList = new TabList();
  assert.equal(tabList.session_id, undefined, "no default should be set");

  tabList = new TabList({session_id: 5});
  assert.equal(tabList.session_id, 5, "default param should be set");
};

exports["test push"] = function(assert) {

  let tabList;

  tabList = new TabList();
  assert.equal(tabList.length, 0, "list should be empty");
  tabList.push("https://example.com", "Example.com");
  assert.equal(tabList.length, 1, "item should have been added");

  Prefs.collect.allowDuplicateUrls = false;
  tabList.push("https://example.com", "Example.com");
  assert.equal(tabList.length, 1, "no duplicate item should have been added");

  Prefs.collect.allowDuplicateUrls = true;
  tabList.push("https://example.com", "Example.com");
  assert.equal(tabList.length, 2, "duplicate item should have been added");

  tabList = new TabList({allowDuplicateUrls: false});
  tabList.push("https://example.com", "Example.com");
  assert.equal(tabList.length, 1, "item should have been added");

  Prefs.collect.allowDuplicateUrls = true;
  tabList.push("https://example.com", "Example.com");
  assert.equal(tabList.length, 1, "item should not have been added: option should take precedence over config");
};

require("sdk/test").run(exports);
