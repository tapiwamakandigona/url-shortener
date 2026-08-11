/**
 * QR codes for short links.
 *
 * What was here before drew a grid of squares that merely *looked* like a QR code — its own
 * comment said "actual QR needs more complex encoding" — and no route ever served it, while
 * the page title advertised "QR Codes". This encodes real QR symbols (Reed-Solomon and all)
 * with the `qrcode` package, and the test suite scans the output with a decoder to prove a
 * phone camera would read it.
 */
import QRCode from 'qrcode';

export interface QrOptions {
  /** pixel size of the PNG, or the nominal SVG viewport */
  size?: number;
  /** quiet-zone width in modules; the spec says 4, and scanners genuinely need it */
  margin?: number;
  dark?: string;
  light?: string;
}

const defaults = { size: 512, margin: 4, dark: '#181715', light: '#ffffff' };

export async function qrSvg(text: string, opts: QrOptions = {}): Promise<string> {
  const o = { ...defaults, ...opts };
  return QRCode.toString(text, {
    type: 'svg',
    width: o.size,
    margin: o.margin,
    errorCorrectionLevel: 'M',
    color: { dark: o.dark, light: o.light },
  });
}

export async function qrPng(text: string, opts: QrOptions = {}): Promise<Buffer> {
  const o = { ...defaults, ...opts };
  return QRCode.toBuffer(text, {
    type: 'png',
    width: o.size,
    margin: o.margin,
    errorCorrectionLevel: 'M',
    color: { dark: o.dark, light: o.light },
  });
}

export async function qrDataUrl(text: string, opts: QrOptions = {}): Promise<string> {
  const o = { ...defaults, ...opts };
  return QRCode.toDataURL(text, {
    width: o.size,
    margin: o.margin,
    errorCorrectionLevel: 'M',
    color: { dark: o.dark, light: o.light },
  });
}
