"use strict";

let squirrelApp = angular.module("squirrelApp", []);

squirrelApp.filter('escape', function () {
  return window.escape;
});

squirrelApp.controller("squirrelCtrl", function ($scope) {
  $scope.tabs = null;

  /** Messaging **/

  $scope.restoreTab = function restoreTab(id, url) {
    self.port.emit("restore_tab", {
      id: id,
      url: url,
    });
  }

  $scope.deleteTab = function deleteTab(id) {
    self.port.emit("delete_tab", {
      id: id,
    });
  }

  $scope.deleteGroup = function deleteGroup(group_id) {
    var tabs = $scope.tabs[group_id];
    var tab_ids = [];
    for (var i=0; i < tabs.length; i++) {
      tab_ids.push(tabs[i].id);
    }
    self.port.emit("delete_group", {
      id: group_id,
      tab_ids: tab_ids,
      grouping: $scope.grouping,
    });
  }

  $scope.restoreGroup = function restoreGroup(group_id) {
    var tabs = $scope.tabs[group_id];
    var tab_ids = [];
    var tab_urls = [];
    for (var i=0; i < tabs.length; i++) {
      tab_ids.push(tabs[i].id);
      tab_urls.push(tabs[i].url);
    }
    self.port.emit("restore_group", {
      id: group_id,
      tab_ids: tab_ids,
      tab_urls: tab_urls,
      grouping: $scope.grouping,
    });
  }

  $scope.deleteAll = function deleteAll() {
    self.port.emit("delete_all");
  }

  self.port.on("data", function (data) {
    $scope.$apply(function() {
      for (let i=0; i < data.groups.length; i++) {
        data.groups[i].date = new Date(data.groups[i].timestamp);
      }
      $scope.grouping = data.type;
      $scope.groups = data.groups;
      $scope.tabs = data.tabs;
    });
  });

  /** UI **/

  $scope.showTabActions = function showTabAction(id) {
    var elem = angular.element(document.querySelector("#tab-action-"+id));
    elem.removeClass("tab-actions-hidden");
  }

  $scope.hideTabActions = function hideTabAction(id) {
    var elem = angular.element(document.querySelector("#tab-action-"+id));
    elem.addClass("tab-actions-hidden");
  }
});

// Low-level data injection
self.port.on("style", function (file) {
  let link = document.createElement("link");
  link.setAttribute("href", file);
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("type", "text/css");
  document.head.appendChild(link);
});
