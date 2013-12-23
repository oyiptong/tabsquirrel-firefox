const simplePrefs = require("simple-prefs");
const {PrefsManager, Prefs} = require("Preferences");

exports["test prefs manager observers"] = function(assert) {
  let original_value = simplePrefs.prefs.open_always_remove_after;
  assert.equal(Prefs.open.removeAfter, original_value);

  PrefsManager.setObservers();
  simplePrefs.prefs.open_always_remove_after = !original_value;
  assert.equal(Prefs.open.removeAfter, !original_value, "pref observer should have triggered");
  PrefsManager.unsetObservers();

  simplePrefs.prefs.open_always_remove_after = original_value;
  assert.equal(Prefs.open.removeAfter, !original_value, "pref observer should not have triggered");
};

require("sdk/test").run(exports);
