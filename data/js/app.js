"use strict";

let squirrelApp = angular.module("squirrelApp", []);

squirrelApp.filter('escape', function () {
  return window.escape;
});

squirrelApp.controller("squirrelCtrl", function ($scope) {
  $scope.tabs = null;

  /** Messaging **/

  $scope.restoreTab = function restoreTab(id) {
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

  $scope.deleteGroup = function deleteGroup(groupID) {
    var tabs = $scope.tabs[groupID];
    var tabIDs = [];
    for (var i=0; i < tabs.length; i++) {
      tabIDs.push(tabs[i].id);
    }
    self.port.emit("delete_group", {
      id: groupID,
      tabIDs: tabIDs,
      grouping: $scope.grouping,
    });
  }

  $scope.restoreGroup = function restoreGroup(groupID) {
    var tabs = $scope.tabs[groupID];
    var tabIDs = [];
    var tabURLs = [];
    for (var i=0; i < tabs.length; i++) {
      tabIDs.push(tabs[i].id);
      tabURLs.push(tabs[i].url);
    }
    self.port.emit("restore_group", {
      id: groupID,
      tabIDs: tabIDs,
      tabURLs: tabURLs,
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
