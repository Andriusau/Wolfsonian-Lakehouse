/**
 * Zero-dependency ZIP generator using the PKZIP STORE (uncompressed) format.
 * Ideal for already-compressed JPEG images, eliminating CPU/memory overhead.
 * Fully compatible with standard unzippers across Windows, macOS, Linux, iOS, and Android.
 */

const makeCrcTable = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
};

const crcTable = makeCrcTable();

export function crc32(data: Uint8Array): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

export interface ZipFileInput {
  name: string;
  data: Uint8Array;
}

export function createStoreZipBlob(files: ZipFileInput[]): Blob {
  const encoder = new TextEncoder();
  const fileEntries: {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
    dosTime: number;
    dosDate: number;
  }[] = [];

  const parts: any[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.byteLength;

    // Local file header (30 bytes)
    const headerBuffer = new ArrayBuffer(30);
    const headerView = new DataView(headerBuffer);
    headerView.setUint32(0, 0x04034b50, true); // local file header signature
    headerView.setUint16(4, 20, true);         // version needed to extract (2.0)
    headerView.setUint16(6, 0x0800, true);     // flags: UTF-8 filename (bit 11)
    headerView.setUint16(8, 0, true);          // compression method: 0 (STORE)
    headerView.setUint16(10, dosTime, true);
    headerView.setUint16(12, dosDate, true);
    headerView.setUint32(14, crc, true);
    headerView.setUint32(18, size, true);      // compressed size
    headerView.setUint32(22, size, true);      // uncompressed size
    headerView.setUint16(26, nameBytes.length, true); // file name length
    headerView.setUint16(28, 0, true);         // extra field length

    fileEntries.push({
      nameBytes,
      crc,
      size,
      offset,
      dosTime,
      dosDate,
    });

    parts.push(headerBuffer, nameBytes, dataBytes);
    offset += 30 + nameBytes.length + size;
  }

  const centralDirStart = offset;
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    // Central directory header (46 bytes)
    const cdBuffer = new ArrayBuffer(46);
    const cdView = new DataView(cdBuffer);
    cdView.setUint32(0, 0x02014b50, true); // central directory header signature
    cdView.setUint16(4, 20, true);         // version made by
    cdView.setUint16(6, 20, true);         // version needed to extract
    cdView.setUint16(8, 0x0800, true);     // flags: UTF-8 filename
    cdView.setUint16(10, 0, true);         // compression method: 0 (STORE)
    cdView.setUint16(12, entry.dosTime, true);
    cdView.setUint16(14, entry.dosDate, true);
    cdView.setUint32(16, entry.crc, true);
    cdView.setUint32(20, entry.size, true); // compressed size
    cdView.setUint32(24, entry.size, true); // uncompressed size
    cdView.setUint16(28, entry.nameBytes.length, true); // file name length
    cdView.setUint16(30, 0, true);         // extra field length
    cdView.setUint16(32, 0, true);         // comment length
    cdView.setUint16(34, 0, true);         // disk number start
    cdView.setUint16(36, 0, true);         // internal file attributes
    cdView.setUint32(38, 0, true);         // external file attributes
    cdView.setUint32(42, entry.offset, true); // relative offset of local header

    parts.push(cdBuffer, entry.nameBytes);
    centralDirSize += 46 + entry.nameBytes.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocdBuffer = new ArrayBuffer(22);
  const eocdView = new DataView(eocdBuffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true);          // number of this disk
  eocdView.setUint16(6, 0, true);          // disk where central directory starts
  eocdView.setUint16(8, fileEntries.length, true);  // number of central directory records on this disk
  eocdView.setUint16(10, fileEntries.length, true); // total number of central directory records
  eocdView.setUint32(12, centralDirSize, true);     // size of central directory
  eocdView.setUint32(16, centralDirStart, true);    // offset of start of central directory
  eocdView.setUint16(20, 0, true);         // comment length

  parts.push(eocdBuffer);

  return new Blob(parts, { type: "application/zip" });
}

export function sanitizeAccessionFilename(identifier: string | null | undefined): string {
  if (!identifier) return "record";
  // If semicolon-separated (Alma records), use primary accession number
  const primaryId = String(identifier).split(";")[0].trim();
  // Strip characters illegal on common filesystems: / \ : * ? " < > |
  const sanitized = primaryId.replace(/[/\\:*?"<>|]/g, "_").trim();
  return sanitized || "record";
}
