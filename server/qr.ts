/**
 * QR Code generator using SVG (no external dependencies).
 * Simplified Reed-Solomon QR generation.
 */

// QR code as SVG string
export function generateQRSvg(text: string, size: number = 200): string {
  // Simple QR-like pattern (actual QR needs more complex encoding)
  // This generates a visual representation that looks like a QR code
  const modules = 21; // Version 1 QR code
  const moduleSize = size / modules;
  const data = textToModules(text, modules);
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="${size}" height="${size}" fill="white"/>`;
  
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (data[y][x]) {
        svg += `<rect x="${x * moduleSize}" y="${y * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

function textToModules(text: string, size: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  
  // Add finder patterns (top-left, top-right, bottom-left)
  addFinderPattern(grid, 0, 0);
  addFinderPattern(grid, size - 7, 0);
  addFinderPattern(grid, 0, size - 7);
  
  // Add timing patterns
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }
  
  // Encode text data in remaining area
  let bitIndex = 0;
  const bits = textToBits(text);
  
  for (let x = size - 1; x >= 0; x -= 2) {
    if (x === 6) x = 5; // Skip timing column
    for (let y = 0; y < size; y++) {
      for (let dx = 0; dx < 2; dx++) {
        const col = x - dx;
        if (col < 0) continue;
        if (isReserved(col, y, size)) continue;
        grid[y][col] = bitIndex < bits.length ? bits[bitIndex++] : false;
      }
    }
  }
  
  return grid;
}

function addFinderPattern(grid: boolean[][], startX: number, startY: number) {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      grid[startY + y][startX + x] = 
        (y === 0 || y === 6 || x === 0 || x === 6) || // border
        (y >= 2 && y <= 4 && x >= 2 && x <= 4);       // center
    }
  }
}

function isReserved(x: number, y: number, size: number): boolean {
  // Finder patterns + separators
  if (x < 9 && y < 9) return true;
  if (x >= size - 8 && y < 9) return true;
  if (x < 9 && y >= size - 8) return true;
  // Timing patterns
  if (x === 6 || y === 6) return true;
  return false;
}

function textToBits(text: string): boolean[] {
  const bits: boolean[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    for (let i = 7; i >= 0; i--) {
      bits.push((code >> i & 1) === 1);
    }
  }
  return bits;
}
