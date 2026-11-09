// 用途：生成可安全参与差异比较的脱敏环境配置副本。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..', '..');

const targets = [
  {
    source: '.env',
    output: 'remote/temp/diff-out/root.env.redacted',
  },
  {
    source: '../xiamu-server/.env',
    output: 'remote/temp/diff-out/server.env.redacted',
  },
];

const redactedKeyPattern = /(PASSWORD|SECRET|TOKEN|CHECKWORD|API_V3_KEY|PRIVATE_KEY(?!_PATH)|PUBLIC_KEY_ID|SERIAL_NO|MCHID|PARTNER_ID|APP_SECRET|APPID|USERNAME)/i;

const isPlainScalar = (value) => (
  /^-?\d+(\.\d+)?$/.test(value)
  || /^(true|false)$/i.test(value)
  || value === ''
);

const createRedactedValue = (value) => {
  const fingerprint = crypto
    .createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')
    .slice(0, 10);

  return `__REDACTED__[len=${value.length},sha256=${fingerprint}]`;
};

const sanitizeEnvContent = (sourcePath, content) => {
  const lines = content.split(/\r?\n/);
  const output = [
    `# Diff-safe copy generated from ${sourcePath}`,
    '# Regenerate with: npm run diff:prepare',
  ];

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      output.push('');
      return;
    }

    if (trimmed.startsWith('#')) {
      output.push(line);
      return;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      output.push(line);
      return;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (isPlainScalar(value) || !redactedKeyPattern.test(key)) {
      output.push(`${key}=${value}`);
      return;
    }

    output.push(`${key}=${createRedactedValue(value)}`);
  });

  return `${output.join('\n')}\n`;
};

const writeRedactedCopy = ({ source, output }) => {
  const sourcePath = path.join(repoRoot, source);
  const outputPath = path.join(repoRoot, output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (!fs.existsSync(sourcePath)) {
    fs.writeFileSync(
      outputPath,
      `# Diff-safe copy generated from ${source}\n# Source file does not exist in this workspace.\n`,
      'utf8'
    );
    return;
  }

  const content = fs.readFileSync(sourcePath, 'utf8');
  fs.writeFileSync(outputPath, sanitizeEnvContent(source, content), 'utf8');
};

targets.forEach(writeRedactedCopy);
