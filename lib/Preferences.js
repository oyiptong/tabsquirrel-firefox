const simplePrefs = require("simple-prefs");

let Prefs = {
  open : {
    removeAfter: simplePrefs.prefs.open_always_remove_after,
    backgroundOpen: simplePrefs.prefs.open_always_in_background,
  },
  collect : {
    allowDuplicateUrls: simplePrefs.prefs.collect_allow_duplicate_urls,
  }
}

let PrefsManager = {
  onPrefChange: function PM_onPrefChange(prefName) {
    switch (prefName) {
      case "open_always_remove_after":
        Prefs.open.removeAfter = simplePrefs.prefs.open_always_remove_after;
        break;
      case "open_always_in_background":
        Prefs.open.backgroundOpen = simplePrefs.prefs.open_always_in_background;
        break;
      case "collect_allow_duplicate_urls":
        Prefs.collect.allowDuplicateUrls = simplePrefs.prefs.collect_allow_duplicate_urls;
        break;
    }
  },

  setObservers: function PM_setObservers() {
    simplePrefs.on("open_always_remove_after", PrefsManager.onPrefChange);
    simplePrefs.on("open_always_in_background", PrefsManager.onPrefChange);
    simplePrefs.on("collect_allow_duplicate_urls", PrefsManager.onPrefChange);
  },

  unsetObservers: function _unsetObservers() {
    simplePrefs.removeListener("open_always_remove_after", PrefsManager.onPrefChange);
    simplePrefs.removeListener("open_always_in_background", PrefsManager.onPrefChange);
    simplePrefs.removeListener("collect_allow_duplicate_urls", PrefsManager.onPrefChange);
  },
};

exports.PrefsManager = PrefsManager;
exports.Prefs = Prefs;
