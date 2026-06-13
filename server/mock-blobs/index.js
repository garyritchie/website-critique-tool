import fs from 'fs/promises';
import path from 'path';

// Store all data in a local directory (relative to current working directory)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

class FileStore {
  constructor(storeName) {
    this.storeName = storeName;
    this.storeDir = path.join(DATA_DIR, storeName);
  }

  async _getFilePath(key) {
    // Sanitize the key to prevent path traversal
    const safeKey = key.replace(/\.\./g, '__');
    return path.join(this.storeDir, safeKey);
  }

  async get(key, options = {}) {
    try {
      const filePath = await this._getFilePath(key);
      const data = await fs.readFile(filePath);
      
      if (options.type === 'json') {
        return JSON.parse(data.toString('utf-8'));
      }
      if (options.type === 'text') {
        return data.toString('utf-8');
      }
      if (options.type === 'arrayBuffer') {
        // Return ArrayBuffer representation of the buffer
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }
      return data;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async getWithMetadata(key, options = {}) {
    const data = await this.get(key, options);
    if (!data) return { data: null, metadata: null };
    
    // Read metadata
    let metadata = {};
    try {
      const metaPath = (await this._getFilePath(key)) + '.meta.json';
      const metaData = await fs.readFile(metaPath, 'utf-8');
      metadata = JSON.parse(metaData);
    } catch (err) {
      // ignore
    }
    return { data, metadata };
  }

  async set(key, value, options = {}) {
    const filePath = await this._getFilePath(key);
    await ensureDir(path.dirname(filePath));

    let dataToBuffer;
    if (typeof value === 'string') {
      dataToBuffer = Buffer.from(value, 'utf-8');
    } else if (value instanceof Uint8Array) {
      dataToBuffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    } else if (value instanceof ArrayBuffer) {
      dataToBuffer = Buffer.from(value);
    } else if (Buffer.isBuffer(value)) {
      dataToBuffer = value;
    } else {
      dataToBuffer = Buffer.from(JSON.stringify(value), 'utf-8');
    }

    await fs.writeFile(filePath, dataToBuffer);

    if (options.metadata) {
      const metaPath = filePath + '.meta.json';
      await fs.writeFile(metaPath, JSON.stringify(options.metadata), 'utf-8');
    }
  }

  async delete(key) {
    try {
      const filePath = await this._getFilePath(key);
      await fs.unlink(filePath);
      try {
        await fs.unlink(filePath + '.meta.json');
      } catch (err) {}
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async list(options = {}) {
    const { prefix } = options;
    const blobs = [];

    const walk = async (dir, base = '') => {
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        for (const file of files) {
          const relativePath = path.join(base, file.name).replace(/\\/g, '/');
          if (file.name.endsWith('.meta.json')) continue;
          
          if (file.isDirectory()) {
            await walk(path.join(dir, file.name), relativePath);
          } else {
            if (!prefix || relativePath.startsWith(prefix)) {
              blobs.push({ key: relativePath });
            }
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    };

    await walk(this.storeDir);
    return { blobs };
  }
}

const stores = {};
export function getStore(storeName) {
  if (!stores[storeName]) {
    stores[storeName] = new FileStore(storeName);
  }
  return stores[storeName];
}
