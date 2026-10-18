import test from "node:test";
import assert from "node:assert/strict";
import { measurementFeedback, parseMeasurements } from "../src/lib/measurements";

test("execution completion requires a nonempty metrics object without fabricating values", () => {
  for (const stdout of ['{"value":42}', '{"metrics":{}}', '{"metrics":[]}', '{"metrics":null}', 'not JSON', '']) {
    assert.equal(parseMeasurements(stdout), undefined);
    assert.match(measurementFeedback(stdout)!, /Measurement output validation failed/);
  }
  assert.deepEqual(parseMeasurements('progress\n{"metrics":{"value":42,"details":[1,2]}}\n'), {value:42,details:[1,2]});
  assert.equal(measurementFeedback('{"metrics":{"value":0}}'), undefined);
  assert.deepEqual(parseMeasurements('{"metrics":{"matched":false}}'), {matched:false});
});
