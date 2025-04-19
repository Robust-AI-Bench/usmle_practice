// Import required libraries
const { CID } = require("multiformats/cid");
const { sha256 } = require("multiformats/hashes/sha2");
const json = require("multiformats/codecs/json");
const raw = require("multiformats/codecs/raw");
const {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require("fs");
const path = require("path");
const csv = require("csv");

/**
 * Converts total seconds to a human-readable time format
 * @param {number} totalSeconds - The time in seconds
 * @returns {string} Formatted time string
 */
function readableTime(totalSeconds) {
  if (totalSeconds >= 86400) {
    const days = Math.floor(totalSeconds / 86400);
    return days.toFixed(2) + (days === 1 ? " day" : " days");
  }
  // Otherwise, if there are at least 3600 seconds, show hours only.
  else if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    return hours.toFixed(2) + (hours === 1 ? " hour" : " hours");
  }
  // Otherwise, if there are at least 60 seconds, show minutes only.
  else if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    return minutes.toFixed(2) + (minutes === 1 ? " minute" : " minutes");
  }
  // Otherwise, show seconds.
  else {
    return (
      totalSeconds.toFixed(2) + (totalSeconds === 1 ? " second" : " seconds")
    );
  }
}

/**
 * Sleep for given milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
async function sleep(ms) {
  return await new Promise((res) => setTimeout(res, ms));
}

/**
 * Generate CID for given data
 * @param {any} data - Data to generate CID for
 * @returns {Promise<CID>} Generated CID
 */
async function generateCID(data) {
  let bytes;

  if (typeof data === "object") {
    bytes = json.encode(data);
  } else {
    bytes = new TextEncoder().encode(`${data}`);
  }

  const hash = await sha256.digest(bytes);
  const cid = CID.create(
    1,
    typeof data === "object" ? json.code : raw.code,
    hash
  );

  return cid;
}

/**
 * Read file from given path
 * @param {string} path - Path to file
 * @returns {string} File contents
 */
function readFile(path) {
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`File doesn't exist: ${path}`);
  }

  return readFileSync(path, { encoding: "utf-8" }).toString();
}

/**
 * Check validation error
 * @param {Object} safeParseReturn - Safe parse return object
 * @param {string} [path] - Optional path
 * @returns {any} Parse data
 */
function checkValidationError(safeParseReturn, path) {
  if (safeParseReturn?.error) {
    throw new Error(parseValidationError(safeParseReturn, path));
  }

  return safeParseReturn.data;
}

 
/**
 * Hash file and save CID
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} CID string
 */
async function hashFile(filePath) {
  const content = readFile(filePath);
  const cid = await generateCID(content);

  writeFileSync(`${filePath}.cid`, cid.toString(), {
    encoding: "utf-8",
  });

  return cid.toString();
}

/**
 * Generate random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns the newest file path from the given paths.
 * Also works with directories.
 * @param {string[]} paths - Array of paths
 * @returns {string} Latest file path
 */
function getLatestFile(paths) {
  const files = paths.map((p) => ({
    path: p,
    date: statSync(p).mtime,
  }));

  files.sort((a, b) => b.date.getTime() - a.date.getTime());
  return files[0]?.path;
}

/**
 * Recursively walks the given path until reaching the given depth.
 * Then returns the files inside that depth recursively.
 * @param {string} dirPath - Path to directory
 * @param {Object} options - Options
 * @param {Function} options.filter - Filter function
 * @param {Function} [options.map] - Map function
 * @param {number} options.depth - Depth to traverse
 * @returns {string[]} Array of file paths
 */
function goIntoDir(dirPath, options) {
  if (options.depth == 0) {
    const files = readdirSync(dirPath, { recursive: true });
    const processed = files
      .map((fil) => path.join(dirPath, fil.toString()))
      .filter((fil) => options.filter(path.parse(fil)));
    return options.map ? options.map(processed) : processed;
  }

  const files = [];
  const dirFiles = readdirSync(dirPath);
  for (const dirFile of dirFiles) {
    const fullPath = path.join(dirPath, dirFile.toString());
    if (statSync(fullPath, { throwIfNoEntry: false })?.isDirectory()) {
      files.push(
        ...goIntoDir(fullPath, {
          depth: options.depth - 1,
          filter: options.filter,
          map: options.map,
        })
      );
    }
  }

  return files;
}

/**
 * Saves the given entity (array, object, primitive etc.) into the output directory (or the path) as JSON or CSV formatted file.
 * Also creates hash & signature files for the newly created file.
 * @param {any} entity - Entity to save
 * @param {"json"|"csv"} type - File type
 * @param {Object} options - Options
 * @param {string|Function} [options.fileNamePrefix] - File name prefix
 * @param {string|Function} [options.fileNameSuffix] - File name suffix
 * @param {string} [options.dirPath] - Directory path
 * @param {string} [options.path] - Full file path
 * @param {boolean} [options.hash] - Whether to hash the file
 * @param {boolean} [options.sign] - Whether to sign the file
 * @returns {Promise<string>} Path of the saved file
 */
 

// Export all functions
module.exports = {
  readableTime,
  sleep,
  generateCID,
  readFile,
  checkValidationError,
  signFile,
  hashFile,
  randomInteger,
  getLatestFile,
  goIntoDir,
  saveEntity,
  saveJobLog
}; 