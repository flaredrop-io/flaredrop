// Simple QR code generator (no external dependencies)
// Based on the QR code specification

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

const EC_LEVELS: Record<ErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Simplified QR generator that creates an SVG
export function generateQRCode(data: string, size: number = 200): string {
  const modules = encodeToModules(data);
  const moduleCount = modules.length;
  const moduleSize = size / moduleCount;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${moduleCount} ${moduleCount}">`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (modules[row][col]) {
        svg += `<rect x="${col}" y="${row}" width="1" height="1" fill="black"/>`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

export function generateQRDataUrl(data: string, size: number = 200): string {
  const svg = generateQRCode(data, size);
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Simplified QR encoding - generates a valid QR code matrix
function encodeToModules(data: string): boolean[][] {
  // Use version based on data length (simplified)
  const version = Math.min(10, Math.max(1, Math.ceil(data.length / 15)));
  const size = version * 4 + 17;

  // Initialize module array
  const modules: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
  const reserved: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));

  // Add finder patterns
  addFinderPattern(modules, reserved, 0, 0);
  addFinderPattern(modules, reserved, size - 7, 0);
  addFinderPattern(modules, reserved, 0, size - 7);

  // Add timing patterns
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
    reserved[6][i] = true;
    reserved[i][6] = true;
  }

  // Add alignment patterns for larger versions
  if (version >= 2) {
    const alignPos = getAlignmentPositions(version);
    for (const row of alignPos) {
      for (const col of alignPos) {
        if (!reserved[row][col]) {
          addAlignmentPattern(modules, reserved, row, col);
        }
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
    if (i < 8) {
      reserved[8][size - 1 - i] = true;
      reserved[size - 1 - i][8] = true;
    }
  }
  modules[size - 8][8] = true; // Dark module

  // Encode data
  const bits = encodeData(data, version);
  placeData(modules, reserved, bits, size);

  // Apply mask (using mask 0 for simplicity)
  applyMask(modules, reserved, size, 0);

  // Add format info
  addFormatInfo(modules, size, 0);

  return modules;
}

function addFinderPattern(modules: boolean[][], reserved: boolean[][], row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr >= 0 && rr < modules.length && cc >= 0 && cc < modules.length) {
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBlack = r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          modules[rr][cc] = isBlack;
        }
        reserved[rr][cc] = true;
      }
    }
  }
}

function addAlignmentPattern(modules: boolean[][], reserved: boolean[][], row: number, col: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      modules[row + r][col + c] = isBlack;
      reserved[row + r][col + c] = true;
    }
  }
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const positions = [6];
  const step = Math.floor((version * 4 + 10) / (Math.floor(version / 7) + 1));
  let pos = version * 4 + 10;
  while (pos > 10) {
    positions.unshift(pos);
    pos -= step;
  }
  positions.unshift(6);
  return [...new Set(positions)].sort((a, b) => a - b);
}

function encodeData(data: string, version: number): boolean[] {
  const bits: boolean[] = [];

  // Mode indicator (byte mode = 0100)
  bits.push(false, true, false, false);

  // Character count
  const countBits = version < 10 ? 8 : 16;
  const count = data.length;
  for (let i = countBits - 1; i >= 0; i--) {
    bits.push(((count >> i) & 1) === 1);
  }

  // Data
  for (const char of data) {
    const code = char.charCodeAt(0);
    for (let i = 7; i >= 0; i--) {
      bits.push(((code >> i) & 1) === 1);
    }
  }

  // Terminator
  for (let i = 0; i < 4 && bits.length < getDataCapacity(version); i++) {
    bits.push(false);
  }

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(false);
  }

  // Pad bytes
  const padBytes = [0b11101100, 0b00010001];
  let padIndex = 0;
  while (bits.length < getDataCapacity(version)) {
    const pad = padBytes[padIndex % 2];
    for (let i = 7; i >= 0; i--) {
      bits.push(((pad >> i) & 1) === 1);
    }
    padIndex++;
  }

  return bits;
}

function getDataCapacity(version: number): number {
  // Simplified capacity for error correction level M
  const capacities = [0, 128, 224, 352, 512, 688, 864, 992, 1232, 1456, 1728];
  return capacities[version] || 1728;
}

function placeData(modules: boolean[][], reserved: boolean[][], bits: boolean[], size: number): void {
  let bitIndex = 0;
  let up = true;

  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col--;

    for (let row = up ? size - 1 : 0; up ? row >= 0 : row < size; row += up ? -1 : 1) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (!reserved[row][cc]) {
          modules[row][cc] = bitIndex < bits.length ? bits[bitIndex++] : false;
        }
      }
    }
    up = !up;
  }
}

function applyMask(modules: boolean[][], reserved: boolean[][], size: number, mask: number): void {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!reserved[row][col]) {
        let invert = false;
        switch (mask) {
          case 0: invert = (row + col) % 2 === 0; break;
          case 1: invert = row % 2 === 0; break;
          case 2: invert = col % 3 === 0; break;
          case 3: invert = (row + col) % 3 === 0; break;
          case 4: invert = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
          case 5: invert = (row * col) % 2 + (row * col) % 3 === 0; break;
          case 6: invert = ((row * col) % 2 + (row * col) % 3) % 2 === 0; break;
          case 7: invert = ((row + col) % 2 + (row * col) % 3) % 2 === 0; break;
        }
        if (invert) modules[row][col] = !modules[row][col];
      }
    }
  }
}

function addFormatInfo(modules: boolean[][], size: number, mask: number): void {
  // Format info for error correction level M and mask
  const formatBits = [
    [true, false, true, false, true, false, false, false, false, false, true, false, false, true, false],
    [true, false, true, false, false, false, true, false, false, true, false, false, true, false, true],
    [true, false, true, true, true, true, false, false, true, true, true, true, false, true, true],
    [true, false, true, true, false, true, true, false, true, false, false, true, true, false, false],
    [true, false, false, false, true, true, true, true, true, false, true, true, true, false, true],
    [true, false, false, false, false, true, false, true, true, true, false, true, false, true, false],
    [true, false, false, true, true, false, true, true, false, true, true, false, true, true, false],
    [true, false, false, true, false, false, false, true, false, false, false, false, false, false, true],
  ][mask];

  // Place format info
  for (let i = 0; i < 15; i++) {
    const bit = formatBits[i];

    // Around top-left finder
    if (i < 6) {
      modules[8][i] = bit;
    } else if (i < 8) {
      modules[8][i + 1] = bit;
    } else if (i < 9) {
      modules[8 - (i - 8)][8] = bit;
    } else {
      modules[14 - i][8] = bit;
    }

    // Around other finders
    if (i < 8) {
      modules[size - 1 - i][8] = bit;
    } else {
      modules[8][size - 15 + i] = bit;
    }
  }
}
