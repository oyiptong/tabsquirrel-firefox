/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {PageMod} = require("page-mod");
const {data} = require("self");
const tabs = require("tabs");
const {BrowserAction} = require("browserAction");

let TABS = [];
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

      worker.port.emit("data", TABS);

      worker.port.on("fetch_tabs", function() {
        worker.port.emit("data", TABS);
      });
    },
  },
}

let Application = {

  _skipUrl : function A__skipUrl(url) {
    for (let i=0; i < kSkipPatterns.length; i++) {
      let pattern = kSkipPatterns[i];
      if (url.match(pattern)) {
        return true;
      }
    }
    return false;
  },

  openTabsMenu: function A_openTabsMenu() {
    for each (let tab in tabs) {
      console.log("considering: " + tab.url);
      if (!Application._skipUrl(tab.url)) {
        TABS.push({url: tab.url, title: tab.title});
      }
    }
    tabs.open(data.url("index.html"));
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

  start: function A_start(loadReason) {
    PageMod(TabsMenu.page);
    Application.addToolbarButton();
  }
}
exports.Application = Application;
exports.TabsMenu = TabsMenu;

exports.main = function main(options, callbacks) {
  //Application.init();
  Application.start(options);
}
