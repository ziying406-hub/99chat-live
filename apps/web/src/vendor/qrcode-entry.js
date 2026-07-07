import QRCode from "qrcode";

export function toSvg(text, options = {}) {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: {
      dark: "#101828",
      light: "#ffffff"
    },
    ...options
  });
}
