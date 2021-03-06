"use strict";

const Promise = require('sdk/core/promise');
const groupPromise = Promise.promised(Array);
const window = require("sdk/window/utils").getMostRecentBrowserWindow();

const {TabStorage} = require("TabStorage");
const {TabDatabase} = require("TabDatabase");
const {Prefs} = require("Preferences");

const {Cu} = require("chrome");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

function TabList(options={}) {
  this.tabs = [];
  this.session_id = options.session_id;
  this.urls = {};
  this.allowDuplicateUrls = options.allowDuplicateUrls;
}

TabList.prototype = {
  get length() {
    return this.tabs.length;
  },

  push : function TL_push(url, title) {
    if (this.allowDuplicateUrls != undefined) {
      // give priority to the optional allowDuplicateUrls attribute
      if (this.allowDuplicateUrls || this.urls[url] != 1) {
        this._addTab(url, title);
      }
    }
    else if (Prefs.collect.allowDuplicateUrls || this.urls[url] !== 1) {
      this._addTab(url, title);
    }
  },

  _addTab: function TL__addTab(url, title) {
    this.urls[url] = 1;
    this.tabs.push(new Tab(url, title));
  },
}

function Tab(url, title) {
  this.url = url;
  this.title = title;
}

function TabController() {
  this._storage = null;
  this.ready = this.init();
}

TabController.prototype = {
  /*
   * Initialize TabController
   */
  init: function TC_init() {
    return Task.spawn(function() {
      let connection = yield TabDatabase.DBConnectionPromise;
      this._storage = new TabStorage(connection);
    }.bind(this));
  },

  /*
   * Given an array of tab objects, add favicons
   * @param tabGroups   an object representing a group of tabs
   * @returns           the input object, with tabs decorated with favicons
   */
  _injectFavicons: function TC__injectFavIcons(tabGroups) {
    return Task.spawn(function injectFavIconTask() {
      yield this.ready;

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
              iconPromise.resolve("https://www.google.com/s2/favicons?domain="+pageURI.asciiHost);
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
    }.bind(this));
  },

  /*
   * Obtain tabs from storage, adding all necessary information
   * @returns   a promise for group-separated tabs
   */
  getTabs: function TC_getTabs() {
    return Task.spawn(function() {
      yield this.ready;

      let groups = yield this._storage.getSessions();

      let session_ids = [];
      for (let i=0; i < groups.length; i++) {
        session_ids.push(groups[i].id);
      }

      let tabGroups = yield this._storage.getTabsForSessions(session_ids);
      let decoratedTabGroups = yield this._injectFavicons(tabGroups);
      throw new Task.Result({groups: groups, tabs:decoratedTabGroups, type:"session"});
    }.bind(this));
  },

  deleteAll: function TC_delete_all() {
    return Task.spawn(function() {
      yield this.ready;
      yield this._storage.deleteAll();
    }.bind(this));
  },

  deleteTab: function TC_delete_tab(id) {
    return Task.spawn(function() {
      yield this.ready;
      yield this._storage.deleteTabs([id]);
    }.bind(this));
  },

  deleteGroup: function TC_deleteGroup(data) {
    return Task.spawn(function() {
      yield this.ready;
      yield this._storage.deleteTabs(data.tab_ids);

      switch (data.grouping) {
        case "session":
          yield this._storage.deleteSession(data.id);
          break;
        case "domain":
          yield this._storage.deleteDomainByName(data.id);
          break;
      }
    }.bind(this));
  },

  createSession: function TC_createSession() {
    return Task.spawn(function () {
      yield this.ready;
      let session_id = yield this._storage.createSession();
      throw new Task.Result(session_id);
    }.bind(this));
  },

  createTab: function TC_createTab(url, title, session_id) {
    return Task.spawn(function() {
      yield this.ready;
      yield this._storage.createTab(url, title, session_id);
    }.bind(this));
  },
  /*
   * processes a TabList and creates a tab for each
   * will use optional session_id found in the tabList object, otherwise will create new session
   * @param tabList - a tabList object
   */
  saveTabList: function TC_saveTabList(tabList) {
    return Task.spawn(function() {
      let session_id = tabList.session_id;
      if (!session_id) {
        session_id = yield this.createSession();
      }
      for each (let tab in tabList.tabs) {
        yield this.createTab(tab.url, tab.title, session_id);
      }
    }.bind(this));
  },
}

exports.TabController = TabController;
exports.TabList = TabList;
exports.Tab = Tab;
