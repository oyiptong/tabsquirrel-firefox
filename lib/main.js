/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {PageMod} = require("sdk/page-mod");
const {data} = require("sdk/self");
const {browserWindows} = require("sdk/windows");
const { uuid } = require('sdk/util/uuid');
const tabs = require("sdk/tabs");
const Promise = require('sdk/core/promise');
const window = require("sdk/window/utils").getMostRecentBrowserWindow();
const {BrowserAction} = require("browserAction");
const groupPromise = Promise.promised(Array);
const {TabStorage} = require("TabStorage");
const {TabDatabase} = require("TabDatabase");

const {Cu} = require("chrome");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

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
        Application.getTabs().then(function getTabs(data) {
          worker.port.emit("data", data);
        });
      }
      fetchTabs();

      worker.port.on("fetch_tabs", fetchTabs);

      worker.port.on("delete_all", function() {
        Application.deleteAll().then(fetchTabs);
      });

      worker.port.on("delete_tab", function(data) {
        Application.deleteTab(data.id).then(fetchTabs);
      });

      worker.port.on("restore_tab", function(data) {
        Application.openTab(data.url);
        if (tsConfig.open.removeAfter) {
          Application.deleteTab(data.id).then(fetchTabs);
        }
      });

      worker.port.on("delete_group", function(data) {
          Application.deleteGroup(data).then(fetchTabs);
      });

      worker.port.on("restore_group", function(data) {
        Application.openTabs(data.tab_urls);
        if (tsConfig.open.removeAfter) {
          Application.deleteGroup(data).then(fetchTabs);
        }
      });
    },
  },
}

let Application = {

  TabStoragePromise: null,

  /** tasks **/

  /*
   * Given an array of tab objects, add favicons
   * @param tabData an array of tab objects
   * @returns an array of tab objects decorated with favicons
   */
  _injectFavicons: function A__injectFavIcons(tabGroups) {
    return Task.spawn(function injectFavIconTask() {
      let promises = [];

      for (let tabKey in tabGroups) {
        let tabData = tabGroups[tabKey];
        // add a favicon promise for each tab
        for each (let tabObj in tabData) {
          let iconPromise = Promise.defer();
          promises.push(iconPromise.promise);

          let pageURI = NetUtil.newURI(tabObj.url);
          PlacesUtils.favicons.getFaviconDataForPage(pageURI, function(aURI, aDataLen, aData, aMimeType){
            if (aDataLen > 0) {
              let dataUrl = "data:" + aMimeType + ";base64," + window.btoa(String.fromCharCode.apply(null, aData));
              iconPromise.resolve(dataUrl);
            }
            else {
              iconPromise.resolve(aURI.spec);
            }
          });
        }

        // wait until all favicons are obtained
        let favicons = yield groupPromise(promises);

        // assign favicons to tabs
        let index = 0;
        for each (let tabObj in tabData) {
          tabObj.favicon = favicons[index];
          index += 1
        }
      }

      throw new Task.Result(tabGroups);
    });
  },

  /** tab operations **/

  getTabs: function A_getTabs() {
    return Task.spawn(function() {
      let tabStorage = yield Application.TabStoragePromise;
      let groups = yield tabStorage.getSessions();

      let session_ids = [];
      for (let i=0; i < groups.length; i++) {
        session_ids.push(groups[i].id);
      }

      let tabGroups = yield tabStorage.getTabsForSessions(session_ids);
      let decoratedTabGroups = yield Application._injectFavicons(tabGroups);
      throw new Task.Result({groups: groups, tabs:decoratedTabGroups, type:"session"});
    });
  },

  deleteAll: function A_delete_all() {
    return Task.spawn(function() {
      let tabStorage = yield Application.TabStoragePromise;
      yield tabStorage.deleteAll();
    });
  },

  deleteTab: function A_delete_tab(id) {
    return Task.spawn(function() {
      let tabStorage = yield Application.TabStoragePromise;
      yield tabStorage.deleteTabs([id]);
    });
  },

  deleteGroup: function A_deleteGroup(data) {
    return Task.spawn(function() {
      let tabStorage = yield Application.TabStoragePromise;
      yield tabStorage.deleteTabs(data.tab_ids);

      switch (data.grouping) {
        case "session":
          yield tabStorage.deleteSession(data.id);
          break;
        case "domain":
          yield tabStorage.deleteDomainByName(data.id);
          break;
      }
    });
  },

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

  /** UI functionality **/

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
      let tabStorage = yield Application.TabStoragePromise;
      let session_id = null;

      let closeList = [];
      let keepList = [];
      let squirrelTab = null;

      for each (let tab in tabs) {
        if (!Application._skipUrl(tab.url)) {
          if (session_id == null) {
            session_id = yield tabStorage.createSession()
          }
          yield tabStorage.createTab(tab.url, tab.title, session_id);
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
    });
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

  init: function A_init() {
    let storageDeferred = Promise.defer();

    Task.spawn(function() {
      try {
        let connection = yield TabDatabase.DBConnectionPromise;
        let tabStorage = new TabStorage(connection);
        storageDeferred.resolve(tabStorage);
      }
      catch(ex) {
        console.error(ex);
      }
    });

    Application.TabStoragePromise = storageDeferred.promise;
  },

  start: function A_start(loadReason) {
    PageMod(TabsMenu.page);
    Application.addToolbarButton();
  }
}
exports.Application = Application;
exports.TabsMenu = TabsMenu;

exports.main = function main(options, callbacks) {
  Application.init();
  Application.start(options);
}
