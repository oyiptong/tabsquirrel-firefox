"use strict";

const {PageMod} = require("sdk/page-mod");
const {data} = require("sdk/self");
const {browserWindows} = require("sdk/windows");
const { uuid } = require('sdk/util/uuid');
const tabs = require("sdk/tabs");
const windows = require("sdk/windows").browserWindows;
const {BrowserAction} = require("browserAction");
const {TabController, TabList, Tab} = require("TabManagement");
const {Cu} = require("chrome");
const {PrefsManager, Prefs} = require("Preferences");
Cu.import("resource://gre/modules/Task.jsm");

const kSkipPatterns = [
  /^about.*/,
  /^resource.*/,
  /^chrome.*/,
];

const kIgnoreTests = [
  function() {
    return this.isPinned;
  },
];

let TabsMenu = {
  page: {
    // load scripts
    contentScriptFile: [
      data.url("js/angular.min.js"),
      data.url("js/app.js"),
    ],

    include: [data.url("index.html")],

    onAttach: function(worker) {
      // inject styles
      worker.port.emit("style", data.url("css/bootstrap.min.css"));
      worker.port.emit("style", data.url("css/bootstrap-theme.min.css"));
      worker.port.emit("style", data.url("css/styles.css"));

      function fetchTabs() {
        Application.tabController.getTabs().then(function(data) {
          worker.port.emit("data", data);
        });
      }
      fetchTabs();

      worker.port.on("fetch_tabs", fetchTabs);

      worker.port.on("delete_all", function() {
        Application.tabController.deleteAll().then(fetchTabs);
      });

      worker.port.on("delete_tab", function(data) {
        Application.tabController.deleteTab(data.id).then(fetchTabs);
      });

      worker.port.on("restore_tab", function(data) {
        if (Prefs.open.removeAfter) {
          Application.tabController.deleteTab(data.id).then(fetchTabs);
        }
      });

      worker.port.on("delete_group", function(data) {
          Application.tabController.deleteGroup(data).then(fetchTabs);
      });

      worker.port.on("restore_group", function(data) {
        Application.openTabs(data.tab_urls);
        if (Prefs.open.removeAfter) {
          Application.tabController.deleteGroup(data).then(fetchTabs);
        }
      });
    },
  },
}

let Application = {

  tabController: new TabController(),

  /** UI functionality **/

  openTab: function A_restoreTab(url) {
    tabs.open({
      url: url,
      inBackground: Prefs.open.backgroundOpen,
    });
  },

  openTabs: function A_openGroup(urls) {
    for (let i=0; i < urls.length; i++) {
      let url = urls[i];
      Application.openTab(url);
    }
  },

  _skipUrl : function A__skipUrl(url) {
    for (let i=0; i < kSkipPatterns.length; i++) {
      let pattern = kSkipPatterns[i];
      if (url.match(pattern)) {
        return true;
      }
    }
    return false;
  },

  _ignoreTab : function A__ignoreTab(tab) {
    return kIgnoreTests.reduce(function(prev, test) {
      return prev || test.bind(tab).call();
    }, false);
  },

  /*
   * Close all tabs and save them.
   * Open squirrel tab.
   */
  openTabsMenu: function A_openTabsMenu() {
    return Task.spawn(function(){

      let closeList = [];
      let squirrelTab = null;
      let squirrelUrl = data.url("index.html");

      let tabList = new TabList();

      //define current window's tabs
      let currentTabs = windows.activeWindow.tabs;

      for each (let tab in currentTabs) {
        if (!Application._ignoreTab(tab)) {
          if (!Application._skipUrl(tab.url)) {
            tabList.push(tab.url, tab.title);
          }
          if (tab.url == squirrelUrl && squirrelTab == null) {
            // keep only one squirreltab if there are multiple open
            squirrelTab = tab;
          } else {
            closeList.push(tab);
          }
        }
      }

      //create the tabs
      if (tabList.tabs.length > 0) {
        yield this.tabController.saveTabList(tabList);
      }

      //open squirrelTab if necessary
      if (squirrelTab === null) {
        tabs.open(squirrelUrl);
      }

      //close marked tabs
      closeList.forEach(function(tab){
        tab.close();
      });

      //refresh all open squirrelTabs
      for each (let tab in tabs) {
        if (tab.url == squirrelUrl) {
          tab.reload();
        };
      }

    }.bind(this));
  },

  addToolbarButton: function A_addToolbarButton() {
    let browserAction = BrowserAction({
      default_title: "Click to squirrel your tabs away",
      default_icon: data.url("assets/ui/acorn_16px.png"),
    });

    browserAction.onClicked.addListener(function(){
      Application.openTabsMenu();
    });
  },

  /** Application functionality **/
  start: function A_start(loadReason) {
    console.debug("loading app with reason: "+loadReason);
    this.tabController.init();
    PageMod(TabsMenu.page);
    Application.addToolbarButton();
    PrefsManager.setObservers();
  },

  unload: function A_unload(unloadReason) {
    console.debug("unloading app with reason: "+unloadReason);
    PrefsManager.unsetObservers();
  },
}
exports.Application = Application;
exports.TabsMenu = TabsMenu;

exports.main = function main(options, callbacks) {
  Application.start(options);
}
