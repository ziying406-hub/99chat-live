export function qrScannerSupport(browser = globalThis) {
  const barcodeDetector = typeof browser?.BarcodeDetector === "function";
  const camera = Boolean(browser?.navigator?.mediaDevices?.getUserMedia);
  return {
    barcodeDetector,
    camera,
    canScanWithCamera: barcodeDetector && camera,
    canScanImage: barcodeDetector
  };
}
