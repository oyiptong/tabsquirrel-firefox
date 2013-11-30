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

  $scope.deleteTab = function deleteTab(index, url) {
    var elem = angular.element(document.querySelector("#tab-details-"+index));
    elem.remove();
    self.port.emit("delete_tab", {
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

  $scope.showTabActions = function showTabAction(index) {
    var elem = angular.element(document.querySelector("#tab-action-"+index));
    elem.removeClass("tab-actions-hidden");
  }

  $scope.hideTabActions = function hideTabAction(index) {
    var elem = angular.element(document.querySelector("#tab-action-"+index));
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
