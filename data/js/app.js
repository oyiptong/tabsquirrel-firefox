"use strict";

let squirrelApp = angular.module("squirrelApp", []);

squirrelApp.filter('escape', function() {
  return window.escape;
});

squirrelApp.controller("squirrelCtrl", function($scope) {
  $scope.data = null;

  $scope.fetchData =  function fetchData() {
    self.port.emit("fetch_data");
  }

  self.port.on("data", function(data) {
    $scope.$apply(_ => {
      $scope.data = data;
    });
  });
});
angular.bootstrap(document, ['squirrelApp']);

// Low-level data injection
self.port.on("style", function(file) {
  let link = document.createElement("link");
  link.setAttribute("href", file);
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("type", "text/css");
  document.head.appendChild(link);
});
