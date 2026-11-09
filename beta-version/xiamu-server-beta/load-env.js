const fs = require('fs');
const path = require('path');

const stripWrappingQuotes = (value) => {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }

  return value;
};

const loadSingleEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1).trim());

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
};

const loadEnvFile = (baseDir) => {
  const resolvedBaseDir = path.resolve(baseDir);
  const candidates = [
    path.resolve(resolvedBaseDir, '.env.local'),
    path.resolve(resolvedBaseDir, '.env'),
    path.resolve(resolvedBaseDir, '..', '.env.local'),
    path.resolve(resolvedBaseDir, '..', '.env'),
  ];

  candidates.forEach(loadSingleEnvFile);
};

module.exports = {
  loadEnvFile,
};
