/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Factory, Unknown} = require("api-utils/xpcom");
const {PageMod} = require("page-mod");
const {BrowserAction} = require("browserAction")
const {data} = require("self");
const {Cc, Ci, Cu, ChromeWorker} = require("chrome");
const tabs = require("tabs");

Cu.import("resource://gre/modules/Services.jsm");

let count = 0;

let openPage = function openPage() {
  tabs.open(data.url("index.html"));
}

exports.main = function(options, callbacks) {
  PageMod({
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

      worker.port.on("fetch_data", function() {
        count += 1;
        worker.port.emit("data", "squirreled: " + count);
      });
    },
  });

  let browserAction = BrowserAction({
    default_title: "Click to squirrel your tabs away",
    default_icon: data.url("assets/ui/icon_16px.png"),
  });
  browserAction.onClicked.addListener(function(){
    openPage();
  });
}
