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
        Application.getTabs().then(function getTabs(tabs) {
          worker.port.emit("data", tabs);
        });
      }
      fetchTabs();

      worker.port.on("fetch_tabs", fetchTabs);

      worker.port.on("delete_all", function() {
        Application.deleteAll().then(fetchTabs);
      });

      worker.port.on("delete_tab", function(evt) {
        Application.deleteTab(evt.id).then(fetchTabs);
      });

      worker.port.on("open_tab", function(evt) {
        Application.openTab(evt.url);
        if (tsConfig.open.removeAfter) {
          Application.deleteTab(evt.id).then(fetchTabs);
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
  _injectFavicons: function A__injectFavIcons(tabData) {
    return Task.spawn(function injectFavIconTask() {
      let promises = [];

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

      throw new Task.Result(tabData);
    });
  },

  /** tab operations **/

  getTabs: function A_getTabs() {
    return Task.spawn(function() {
      let tabStorage = yield Application.TabStoragePromise;
      let groups = yield tabStorage.getSessions();

      let sessionIDs = [];
      for (let i=0; i < groups.length; i++) {
        sessionIDs.push(groups[i].id);
      }

      let tabs = yield tabStorage.getTabsForSessions(sessionIDs);
      let decoratedTabs = yield Application._injectFavicons(tabs);
      throw new Task.Result(decoratedTabs);
    });
  },

  deleteTab: function A_delete_tab(id) {
    return Task.spawn(function() {
      let tabStorage = yield Application.TabStoragePromise;
      yield tabStorage.deleteTab(id);
    });
  },

  deleteAll: function A_delete_all() {
    return Task.spawn(function() {
      let tabStorage = yield Application.TabStoragePromise;
      yield tabStorage.deleteAll();
    });
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

  openTab: function A_openTab(url) {
    tabs.open({
      url: url,
      inBackground: tsConfig.open.backgroundOpen,
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
