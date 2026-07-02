import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type QRErrorLevel = "L" | "M" | "Q" | "H";

/**
 * QRCode generates and renders a QR code from a text value using a pure
 * TypeScript encoder with configurable error correction and visual options.
 * @example
 * ```tsx
 * <QRCode />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/q-r-code)

 */
export interface QRCodeProps extends AccessControlledProps {
  /** Text or URL to encode in the QR code. */
  value: string;
  /** Size of the QR code in pixels. @default 128 */
  size?: number;
  /** Foreground color for QR modules. @default "var(--text-primary)" */
  color?: string;
  /** Background color behind the QR code. @default "var(--surface-canvas)" */
  bgColor?: string;
  /** Reed-Solomon error correction level. @default "M" */
  errorLevel?: QRErrorLevel;
  /** URL of a center icon overlay image. */
  icon?: string;
  /** Size of the center icon in pixels. Defaults to 25% of the QR size. */
  iconSize?: number;
  /** Render a border and padding around the QR code. @default true */
  bordered?: boolean;
  /** Current status affecting the visual state. @default "active" */
  status?: "active" | "expired" | "loading";
  /** Callback fired when the "Refresh" button is clicked in expired state. */
  onRefresh?: () => void;
  /** Additional CSS class name. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  QR Code Encoding (Pure implementation)                             */
/* ------------------------------------------------------------------ */

// Galois Field GF(2^8) tables for Reed-Solomon
const GF_EXP: number[] = new Array(512);
const GF_LOG: number[] = new Array(256);

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x >= 256) x ^= 0x11d; // primitive polynomial
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
  GF_LOG[0] = -1; // undefined
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    const factor = [1, GF_EXP[i]];
    const newG: number[] = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        newG[j + k] ^= gfMul(g[j], factor[k]);
      }
    }
    g = newG;
  }
  return g;
}

function rsEncode(data: number[], nsym: number): number[] {
  const gen = rsGeneratorPoly(nsym);
  const msg = [...data, ...new Array(nsym).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// QR constants
const EC_CODEWORDS: Record<QRErrorLevel, number[]> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const DATA_CAPACITY_BYTES: Record<QRErrorLevel, number[]> = {
  L: [19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721, 795, 861, 932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631, 1735, 1843, 1955, 2071, 2191, 2306, 2434, 2566, 2702, 2812, 2956],
  M: [16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563, 627, 669, 714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812, 1914, 1992, 2102, 2216, 2334],
  Q: [13, 22, 34, 48, 62, 76, 88, 110, 132, 154, 180, 206, 244, 261, 295, 325, 367, 397, 445, 485, 512, 568, 614, 664, 718, 754, 808, 871, 911, 985, 1033, 1115, 1171, 1231, 1286, 1354, 1426, 1502, 1582, 1666],
  H: [9, 16, 26, 36, 46, 60, 66, 86, 100, 122, 140, 158, 180, 197, 223, 253, 283, 313, 341, 385, 406, 442, 464, 514, 538, 596, 628, 661, 701, 745, 793, 845, 901, 961, 986, 1054, 1096, 1142, 1222, 1276],
};

const NUM_EC_BLOCKS: Record<QRErrorLevel, number[]> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const ALIGNMENT_POSITIONS: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

function getVersion(dataLength: number, ecLevel: QRErrorLevel): number {
  for (let v = 0; v < 40; v++) {
    if (DATA_CAPACITY_BYTES[ecLevel][v] >= dataLength) return v + 1;
  }
  return 40; // fallback to max
}

function getModuleCount(version: number): number {
  return 17 + version * 4;
}

function encodeData(text: string): number[] {
  // Byte mode encoding
  const data: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      data.push(code);
    } else if (code < 2048) {
      data.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      data.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return data;
}

function createModules(version: number): boolean[][] {
  const size = getModuleCount(version);
  return Array.from({ length: size }, () => Array(size).fill(false));
}

function createReserved(version: number): boolean[][] {
  const size = getModuleCount(version);
  return Array.from({ length: size }, () => Array(size).fill(false));
}

function placeFinderPattern(modules: boolean[][], reserved: boolean[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= modules.length || cc >= modules.length) continue;
      if (
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      ) {
        modules[rr][cc] = true;
      } else {
        modules[rr][cc] = false;
      }
      reserved[rr][cc] = true;
    }
  }
}

function placeAlignmentPattern(modules: boolean[][], reserved: boolean[][], row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= modules.length || cc >= modules.length) continue;
      if (reserved[rr][cc]) continue;
      modules[rr][cc] = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      reserved[rr][cc] = true;
    }
  }
}

function placeTimingPatterns(modules: boolean[][], reserved: boolean[][]) {
  const size = modules.length;
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) {
      modules[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      modules[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }
}

function reserveFormatInfo(reserved: boolean[][]) {
  const size = reserved.length;
  // Around top-left finder
  for (let i = 0; i <= 8; i++) {
    if (i < size) reserved[8][i] = true;
    if (i < size) reserved[i][8] = true;
  }
  // Around bottom-left finder
  for (let i = 0; i < 7; i++) {
    reserved[size - 1 - i][8] = true;
  }
  // Around top-right finder
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
  }
  // Dark module
  reserved[size - 8][8] = true;
}

function placeData(modules: boolean[][], reserved: boolean[][], bits: number[]) {
  const size = modules.length;
  let bitIdx = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip timing column

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const col = right - c;
        if (col < 0 || reserved[row][col]) continue;
        modules[row][col] = bitIdx < bits.length ? bits[bitIdx] === 1 : false;
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

function applyMask(modules: boolean[][], reserved: boolean[][], maskNum: number): boolean[][] {
  const size = modules.length;
  const masked = modules.map((row) => [...row]);

  const maskFn = (r: number, c: number): boolean => {
    switch (maskNum) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
      default: return false;
    }
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && maskFn(r, c)) {
        masked[r][c] = !masked[r][c];
      }
    }
  }
  return masked;
}

function penaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  // Rule 1: consecutive same-color modules in row/col
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === modules[r][c - 1]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score += 1;
      } else {
        count = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === modules[r - 1][c]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score += 1;
      } else {
        count = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = modules[r][c];
      if (val === modules[r][c + 1] && val === modules[r + 1][c] && val === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  return score;
}

const FORMAT_INFO_STRINGS: number[][] = (() => {
  // Pre-computed format info bits for each EC level + mask combination
  const ecLevelBits: Record<QRErrorLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
  const results: number[][] = [];

  for (const level of ["L", "M", "Q", "H"] as QRErrorLevel[]) {
    for (let mask = 0; mask < 8; mask++) {
      const data = (ecLevelBits[level] << 3) | mask;
      // BCH(15,5) encoding
      let bits = data << 10;
      for (let i = 4; i >= 0; i--) {
        if (bits & (1 << (i + 10))) {
          bits ^= 0x537 << i; // generator polynomial
        }
      }
      const result = ((data << 10) | bits) ^ 0x5412; // XOR mask
      const arr: number[] = [];
      for (let i = 14; i >= 0; i--) {
        arr.push((result >> i) & 1);
      }
      results.push(arr);
    }
  }
  return results;
})();

function getFormatInfoBits(ecLevel: QRErrorLevel, mask: number): number[] {
  const ecIdx = { L: 0, M: 1, Q: 2, H: 3 }[ecLevel];
  return FORMAT_INFO_STRINGS[ecIdx * 8 + mask];
}

function placeFormatInfo(modules: boolean[][], ecLevel: QRErrorLevel, mask: number) {
  const bits = getFormatInfoBits(ecLevel, mask);
  const size = modules.length;

  // Horizontal - near top-left
  const hPositions = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];

  for (let i = 0; i < 15; i++) {
    modules[hPositions[i][0]][hPositions[i][1]] = bits[i] === 1;
  }

  // Vertical - near other finders
  const vPositions = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];

  for (let i = 0; i < 15; i++) {
    modules[vPositions[i][0]][vPositions[i][1]] = bits[i] === 1;
  }

  // Dark module
  modules[size - 8][8] = true;
}

/**
 * Generate a QR code module matrix from a text string.
 */
export function generateQRMatrix(text: string, ecLevel: QRErrorLevel = "M"): boolean[][] {
  const rawData = encodeData(text);
  const version = getVersion(rawData.length + 3, ecLevel); // +3 for mode + length overhead
  const moduleCount = getModuleCount(version);
  const totalDataCodewords = DATA_CAPACITY_BYTES[ecLevel][version - 1];
  const ecCodewordsPerBlock = EC_CODEWORDS[ecLevel][version - 1];
  const numBlocks = NUM_EC_BLOCKS[ecLevel][version - 1];

  // Build data stream with mode indicator and character count
  const dataBits: number[] = [];
  // Mode indicator: 0100 = byte mode
  dataBits.push(0, 1, 0, 0);

  // Character count indicator
  const countBits = version <= 9 ? 8 : 16;
  for (let i = countBits - 1; i >= 0; i--) {
    dataBits.push((rawData.length >> i) & 1);
  }

  // Data bits
  for (const byte of rawData) {
    for (let i = 7; i >= 0; i--) {
      dataBits.push((byte >> i) & 1);
    }
  }

  // Terminator
  const totalDataBits = totalDataCodewords * 8;
  const terminatorLen = Math.min(4, totalDataBits - dataBits.length);
  for (let i = 0; i < terminatorLen; i++) dataBits.push(0);

  // Pad to byte boundary
  while (dataBits.length % 8 !== 0) dataBits.push(0);

  // Pad bytes
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBits.length < totalDataBits) {
    for (let i = 7; i >= 0; i--) {
      dataBits.push((padBytes[padIdx] >> i) & 1);
    }
    padIdx = (padIdx + 1) % 2;
  }

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (dataBits[i + j] ?? 0);
    }
    dataBytes.push(byte);
  }

  // Split into blocks and compute EC
  const dataPerBlock = Math.floor(totalDataCodewords / numBlocks);
  const extraBlocks = totalDataCodewords % numBlocks;
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;

  for (let b = 0; b < numBlocks; b++) {
    const blockSize = dataPerBlock + (b >= numBlocks - extraBlocks ? 1 : 0);
    const block = dataBytes.slice(offset, offset + blockSize);
    blocks.push(block);
    ecBlocks.push(rsEncode(block, ecCodewordsPerBlock));
    offset += blockSize;
  }

  // Interleave data blocks
  const maxDataLen = Math.max(...blocks.map((b) => b.length));
  const interleavedData: number[] = [];
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.length) interleavedData.push(block[i]);
    }
  }

  // Interleave EC blocks
  for (let i = 0; i < ecCodewordsPerBlock; i++) {
    for (const ecBlock of ecBlocks) {
      if (i < ecBlock.length) interleavedData.push(ecBlock[i]);
    }
  }

  // Convert to bit stream
  const finalBits: number[] = [];
  for (const byte of interleavedData) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((byte >> i) & 1);
    }
  }

  // Create matrix
  const modules = createModules(version);
  const reserved = createReserved(version);

  // Place finder patterns
  placeFinderPattern(modules, reserved, 0, 0);
  placeFinderPattern(modules, reserved, 0, moduleCount - 7);
  placeFinderPattern(modules, reserved, moduleCount - 7, 0);

  // Place alignment patterns
  if (version >= 2) {
    const positions = ALIGNMENT_POSITIONS[version];
    for (const row of positions) {
      for (const col of positions) {
        placeAlignmentPattern(modules, reserved, row, col);
      }
    }
  }

  // Place timing patterns
  placeTimingPatterns(modules, reserved);

  // Reserve format info areas
  reserveFormatInfo(reserved);

  // Place data
  placeData(modules, reserved, finalBits);

  // Try all masks and pick best
  let bestMask = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const masked = applyMask(modules, reserved, m);
    const score = penaltyScore(masked);
    if (score < bestScore) {
      bestScore = score;
      bestMask = m;
    }
  }

  const finalModules = applyMask(modules, reserved, bestMask);
  placeFormatInfo(finalModules, ecLevel, bestMask);

  return finalModules;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const QRCode = React.forwardRef<HTMLDivElement, QRCodeProps>(function QRCode(
  {
    value,
    size = 128,
    color = "var(--text-primary)",
    bgColor = "var(--surface-canvas)",
    errorLevel = "M",
    icon,
    iconSize: iconSizeProp,
    bordered = true,
    status = "active",
    onRefresh,
    className,
    access = "full",
    accessReason,
  },
  forwardedRef,
) {
  const accessState = resolveAccessState(access);

  const matrix = React.useMemo(() => {
    if (!value) return [];
    try {
      return generateQRMatrix(value, errorLevel);
    } catch {
      return [];
    }
  }, [value, errorLevel]);

  if (accessState.isHidden) return null;

  const moduleCount = matrix.length;
  const iconSize = iconSizeProp ?? Math.floor(size * 0.25);
  const iconPos = (size - iconSize) / 2;
  const quietZone = 4; // quiet zone modules
  const totalModules = moduleCount + quietZone * 2;
  const cellSize = moduleCount > 0 ? size / totalModules : 1;

  return (
    <div
      ref={forwardedRef}
      data-access-state={accessState.state}
      className={cn(
        "relative inline-flex items-center justify-center",
        bordered && "rounded-lg border border-border-default p-3",
        accessState.isDisabled && "cursor-not-allowed opacity-50",
        className,
      )}
      title={accessReason}
      data-testid="qrcode-root"
      role="img"
      aria-label={`QR Code for ${value}`}
    >
      {status === "loading" ? (
        <div
          className="flex items-center justify-center"
          style={{ width: size, height: size }}
          data-testid="qrcode-loading"
        >
          <svg
            className="animate-spin text-text-secondary"
            width={size * 0.3}
            height={size * 0.3}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50" strokeLinecap="round" />
          </svg>
        </div>
      ) : (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          data-testid="qrcode-svg"
          aria-hidden="true"
        >
          <rect width={size} height={size} fill={bgColor} />
          {matrix.map((row, r) =>
            row.map(
              (cell, c) =>
                cell && (
                  <rect
                    key={`${r}-${c}`}
                    x={(c + quietZone) * cellSize}
                    y={(r + quietZone) * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill={color}
                  />
                ),
            ),
          )}
          {icon && status === "active" && (
            <>
              <rect
                x={iconPos - 2}
                y={iconPos - 2}
                width={iconSize + 4}
                height={iconSize + 4}
                fill={bgColor}
                rx={4}
              />
              <image
                href={icon}
                x={iconPos}
                y={iconPos}
                width={iconSize}
                height={iconSize}
                data-testid="qrcode-icon"
              />
            </>
          )}
        </svg>
      )}

      {status === "expired" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--surface-canvas)_90%,transparent)]"
          data-testid="qrcode-expired"
        >
          <span className="mb-2 text-sm text-text-secondary">
            QR Code expired
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-md bg-accent-primary px-3 py-1.5 text-sm text-text-inverse transition-colors hover:opacity-90"
              data-testid="qrcode-refresh"
              disabled={accessState.isDisabled}
            >
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
});

QRCode.displayName = "QRCode";

export default QRCode;
