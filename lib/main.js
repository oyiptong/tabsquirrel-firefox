/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {PageMod} = require("sdk/page-mod");
const {data} = require("sdk/self");
const {browserWindows} = require("sdk/windows");
const { uuid } = require('sdk/util/uuid');
const tabs = require("sdk/tabs");
const {BrowserAction} = require("browserAction");
const {TabController} = require("TabController");

const {Cu} = require("chrome");
Cu.import("resource://gre/modules/Task.jsm");

const kSkipPatterns = [
  /^about.*/,
  /^resource.*/,
  /^chrome.*/,
];

/* tab squirrel config */
const tsConfig = {
  open : {
    removeAfter: false,
    backgroundOpen: false
  }
}

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
        if (tsConfig.open.removeAfter) {
          Application.tabController.deleteTab(data.id).then(fetchTabs);
        }
      });

      worker.port.on("delete_group", function(data) {
          Application.tabController.deleteGroup(data).then(fetchTabs);
      });

      worker.port.on("restore_group", function(data) {
        Application.openTabs(data.tab_urls);
        if (tsConfig.open.removeAfter) {
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
      inBackground: tsConfig.open.backgroundOpen,
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

  /*
   * Close all tabs and save them.
   * Open squirrel tab.
   */
  openTabsMenu: function A_openTabsMenu() {
    return Task.spawn(function(){
      let session_id = null;

      let closeList = [];
      let keepList = [];
      let squirrelTab = null;

      for each (let tab in tabs) {
        if (!Application._skipUrl(tab.url)) {
          if (session_id == null) {
            session_id = yield this.tabController.createSession();
          }
          yield this.tabController.createTab(tab.url, tab.title, session_id);
        }
        if (tab.url == data.url("index.html")) {
          // keep only one squirreltab if there are multiple open
          if (squirrelTab == null) {
            keepList.push(tab);
            squirrelTab = tab;
          }
        }
        else {
          closeList.push(tab)
        }
      }

      if (squirrelTab != null) {
        squirrelTab.reload();
      }
      else {
        tabs.open(data.url("index.html"));
      }

      closeList.map(function(tab){tab.close()})
    }.bind(this));
  },

  addToolbarButton: function A_addToolbarButton() {
    let browserAction = BrowserAction({
      default_title: "Click to squirrel your tabs away",
      default_icon: data.url("assets/ui/icon_16px.png"),
    });

    browserAction.onClicked.addListener(function(){
      Application.openTabsMenu();
    });
  },

  /** Application functionality **/
  start: function A_start(loadReason) {
    this.tabController.init();
    PageMod(TabsMenu.page);
    Application.addToolbarButton();
  }
}
exports.Application = Application;
exports.TabsMenu = TabsMenu;

exports.main = function main(options, callbacks) {
  Application.start(options);
}
