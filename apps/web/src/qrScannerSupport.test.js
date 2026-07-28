import assert from "node:assert/strict";
import test from "node:test";

import { qrScannerSupport } from "./qrScannerSupport.js";

test("uses the bundled decoder so Safari only needs camera access", () => {
  const supported = qrScannerSupport({
    BarcodeDetector: class {},
    navigator: { mediaDevices: { getUserMedia() {} } }
  });
  assert.deepEqual(supported, {
    barcodeDetector: true,
    camera: true,
    canScanWithCamera: true,
    canScanImage: true
  });

  assert.equal(qrScannerSupport({ navigator: { mediaDevices: {} } }).canScanWithCamera, false);
  assert.equal(qrScannerSupport({ navigator: { mediaDevices: {} } }).canScanImage, true);
});
