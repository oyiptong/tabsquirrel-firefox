"use strict";

let squirrelApp = angular.module("squirrelApp", []);

squirrelApp.filter('escape', function () {
  return window.escape;
});

squirrelApp.controller("squirrelCtrl", function ($scope) {
  $scope.tabs = null;

  /** Messaging **/

  $scope.openTab = function openTab(url) {
    self.port.emit("open_tab", {
      url: url
    });
  }

  $scope.deleteTab = function deleteTab(id, url) {
    self.port.emit("delete_tab", {
      id: id,
      url: url
    });
  }

  $scope.fetchData = function fetchData() {
    self.port.emit("fetch_tabs");
  }

  $scope.deleteAll = function deleteAll() {
    self.port.emit("delete_all");
  }

  self.port.on("data", function (data) {
    $scope.$apply(_ => {
      $scope.tabs = data;
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
