/**
 * Regression test for: "Invalid IP address: undefined"
 *
 * Root cause: the https.request `lookup` callback always called
 *   callback(null, address, family)
 * When Node internals invoke `lookup` with options.all === true they expect
 *   callback(null, [{ address, family }])
 * Passing a plain string address when an array is expected caused Node to
 * receive `undefined` as the IP address, producing the error.
 *
 * Fix: branch on options.all and return the appropriate shape.
 */

"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

// ---------------------------------------------------------------------------
// Minimal reproduction of the lookup callback extracted from fetchImageBuffer
// ---------------------------------------------------------------------------
function makeLookupCallback(target) {
  return function lookup(_hostname, options, callback) {
    const record = { address: target.address, family: target.family };
    if (options && options.all) {
      callback(null, [record]);
    } else {
      callback(null, record.address, record.family);
    }
  };
}

test("lookup callback – options.all false: passes address and family as positional args", () => {
  const target = { address: "93.184.216.34", family: 4 };
  const lookup = makeLookupCallback(target);

  let called = false;
  lookup("example.com", { all: false }, (err, address, family) => {
    called = true;
    assert.equal(err, null);
    assert.equal(address, "93.184.216.34", "address should be the string IP");
    assert.equal(family, 4, "family should be 4");
    // Ensure we did NOT accidentally receive an array
    assert.notEqual(typeof address, "object", "address must not be an array/object");
  });
  assert.ok(called, "callback must have been invoked");
});

test("lookup callback – options.all true: passes array of records", () => {
  const target = { address: "93.184.216.34", family: 4 };
  const lookup = makeLookupCallback(target);

  let called = false;
  lookup("example.com", { all: true }, (err, records) => {
    called = true;
    assert.equal(err, null);
    assert.ok(Array.isArray(records), "records must be an array when options.all is true");
    assert.equal(records.length, 1);
    assert.equal(records[0].address, "93.184.216.34");
    assert.equal(records[0].family, 4);
  });
  assert.ok(called, "callback must have been invoked");
});

test("lookup callback – options.all true (regression): address is never undefined", () => {
  const target = { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 };
  const lookup = makeLookupCallback(target);

  lookup("example.com", { all: true }, (err, records) => {
    assert.equal(err, null);
    // Before the fix, the third positional arg was used as `records`,
    // which was undefined, triggering "Invalid IP address: undefined".
    assert.ok(Array.isArray(records), "must be an array – the pre-fix bug returned undefined here");
    assert.equal(records[0].address, "2606:2800:220:1:248:1893:25c8:1946");
    assert.equal(records[0].family, 6);
  });
});
