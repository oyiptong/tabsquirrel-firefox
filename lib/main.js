/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {PageMod} = require("sdk/page-mod");
const {data} = require("sdk/self");
const {browserWindows} = require("sdk/windows");
const {storage} = require("sdk/simple-storage");
const tabs = require("sdk/tabs");
const Promise = require('sdk/core/promise');
const window = require("sdk/window/utils").getMostRecentBrowserWindow();
const {BrowserAction} = require("browserAction");
const groupPromise = Promise.promised(Array);

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
    removeAfter: true,
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

      worker.port.on("fetch_tabs", function() {
        fetchTabs();
      });

      worker.port.on("delete_all", function() {
        Application.deleteAll().then(function delete_cb(numDeleted) {
          fetchTabs();
          worker.port.emit("delete_complete", numDeleted);
        });
      });

      worker.port.on("open_tab", function(ev) {
        Application.openTab(ev.url);
        if (tsConfig.open.removeAfter) {
          //TODO: delete tab from list
        }
      });
    },
  },
}

let Application = {

  /** tasks **/

  injectFavicons: function A_injectFavIcons(tabData) {
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
    let tabPromise = Promise.defer();
    let tabData = storage.tabs;

    Application.injectFavicons(tabData).then(function(annotatedTabs) {
      tabPromise.resolve(annotatedTabs);
    });
    return tabPromise.promise;
  },

  deleteAll: function A_delete_all() {
    let deletionPromise = Promise.defer();
    let sizeBefore = storage.tabs.length;
    storage.tabs = [];
    deletionPromise.resolve(sizeBefore);
    return deletionPromise.promise;
  },

  /** UI functinality **/

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

    let closeList = [];
    let keepList = [];
    let squirrelTab = null;

    for each (let tab in tabs) {
      if (!Application._skipUrl(tab.url)) {
        storage.tabs.push({url: tab.url, title: tab.title});
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
    if (!storage.tabs) {
      storage.tabs = [];
    }
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
