/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {PageMod} = require("sdk/page-mod");
const {data} = require("sdk/self");
const tabs = require("sdk/tabs");
const {browserWindows} = require("sdk/windows");
const {BrowserAction} = require("browserAction");
const {storage} = require("sdk/simple-storage");
const Promise = require('sdk/core/promise');

const kSkipPatterns = [
  /^about.*/,
  /^resource.*/,
  /^chrome.*/,
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
    },
  },
}

let Application = {

  /** tab operations **/

  getTabs: function A_getTabs() {
    let tabPromise = Promise.defer();
    tabPromise.resolve(storage.tabs);
    return tabPromise.promise;
  },

  delete_all: function A_delete_all() {
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
    let hasSquirrelTab = false;

    for each (let tab in tabs) {
      if (!Application._skipUrl(tab.url)) {
        storage.tabs.push({url: tab.url, title: tab.title});
      }
      if (tab.url == data.url("index.html")) {
        if (!hasSquirrelTab) {
          keepList.push(tab);
          hasSquirrelTab = true;
        }
      }
      else {
        closeList.push(tab)
      }
    }

    if (hasSquirrelTab) {
      // refresh opened squirrel tab
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
