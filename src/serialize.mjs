import { sha256hex } from './sha256.mjs';

/**
 * §8.1 Pinned export serialization (determinism-critical).
 * Rules applied recursively:
 * - Object keys in lexicographic order EXCEPT '@id' then '@type' come FIRST
 * - Arrays render in order, BUT an array whose items are objects carrying '@id'
 *   is sorted by '@id'
 * - The top-level '@context' value, if a string, is kept as-is (IRI reference form)
 * Output: 2-space-indented JSON, LF newlines, no trailing whitespace, terminal newline.
 * Pure and deterministic — no I/O, no clock (§1.1).
 */
export function pinnedSerialize(doc) {
  const lines = [];
  serializeValue(doc, 0, lines, true);
  return lines.join('\n') + '\n';
}

/**
 * §5.3 Serialization hash: 'sha256:' + sha256hex(pinnedSerialize(doc)).
 */
export function serializationHash(doc) {
  return 'sha256:' + sha256hex(pinnedSerialize(doc));
}

/**
 * Sort object keys: '@id' first, '@type' second, then lexicographic.
 */
function sortKeys(keys) {
  return [...keys].sort((a, b) => {
    if (a === '@id' && b !== '@id') return -1;
    if (b === '@id' && a !== '@id') return 1;
    if (a === '@type' && b !== '@type') return -1;
    if (b === '@type' && a !== '@type') return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Returns true if every element of arr is an object with an '@id' property.
 */
function isIdSortedArray(arr) {
  return arr.length > 0 && arr.every(item => item !== null && typeof item === 'object' && !Array.isArray(item) && '@id' in item);
}

/**
 * Serialize a value into indented lines.
 * @param {*} value - the value to serialize
 * @param {number} depth - current indentation depth
 * @param {string[]} lines - output lines accumulator
 * @param {boolean} isTopLevel - whether this is the top-level document call
 */
function serializeValue(value, depth, lines, isTopLevel) {
  const indent = '  '.repeat(depth);
  const indentInner = '  '.repeat(depth + 1);

  if (value === null || typeof value !== 'object') {
    lines.push(indent + JSON.stringify(value));
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(indent + '[]');
      return;
    }
    const items = isIdSortedArray(value)
      ? [...value].sort((a, b) => {
          const ai = a['@id'] || '';
          const bi = b['@id'] || '';
          return ai < bi ? -1 : ai > bi ? 1 : 0;
        })
      : value;
    lines.push(indent + '[');
    for (let i = 0; i < items.length; i++) {
      const itemLines = [];
      serializeValue(items[i], depth + 1, itemLines, false);
      if (i < items.length - 1) {
        itemLines[itemLines.length - 1] += ',';
      }
      for (const l of itemLines) lines.push(l);
    }
    lines.push(indent + ']');
    return;
  }

  // Object
  const keys = Object.keys(value);
  if (keys.length === 0) {
    lines.push(indent + '{}');
    return;
  }

  const sortedKeys = sortKeys(keys);

  lines.push(indent + '{');
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const val = value[key];
    const isLast = i === sortedKeys.length - 1;
    const keyStr = indentInner + JSON.stringify(key) + ': ';

    // Special case: top-level '@context' string stays as-is (IRI reference form)
    if (isTopLevel && key === '@context' && typeof val === 'string') {
      lines.push(keyStr + JSON.stringify(val) + (isLast ? '' : ','));
      continue;
    }

    if (val === null || typeof val !== 'object') {
      lines.push(keyStr + JSON.stringify(val) + (isLast ? '' : ','));
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(keyStr + '[]' + (isLast ? '' : ','));
      } else {
        const items = isIdSortedArray(val)
          ? [...val].sort((a, b) => {
              const ai = a['@id'] || '';
              const bi = b['@id'] || '';
              return ai < bi ? -1 : ai > bi ? 1 : 0;
            })
          : val;
        lines.push(keyStr.trimEnd());
        lines[lines.length - 1] = indentInner + JSON.stringify(key) + ': [';
        for (let j = 0; j < items.length; j++) {
          const itemLines = [];
          serializeValue(items[j], depth + 2, itemLines, false);
          if (j < items.length - 1) {
            itemLines[itemLines.length - 1] += ',';
          }
          for (const l of itemLines) lines.push(l);
        }
        lines.push('  '.repeat(depth + 1) + ']' + (isLast ? '' : ','));
      }
    } else {
      // nested object
      lines.push(indentInner + JSON.stringify(key) + ': {');
      const nestedKeys = sortKeys(Object.keys(val));
      const innerIndent = '  '.repeat(depth + 2);
      if (nestedKeys.length === 0) {
        lines[lines.length - 1] = indentInner + JSON.stringify(key) + ': {}' + (isLast ? '' : ',');
      } else {
        // Recurse properly by building a temp and then integrating
        const subLines = [];
        serializeObject(val, depth + 1, subLines);
        // replace the '{' we just pushed with the full subLines
        lines.pop();
        for (let si = 0; si < subLines.length; si++) {
          const subLine = subLines[si];
          if (si === 0) {
            lines.push(indentInner + JSON.stringify(key) + ': ' + subLine.trimStart());
          } else if (si === subLines.length - 1) {
            lines.push(subLine + (isLast ? '' : ','));
          } else {
            lines.push(subLine);
          }
        }
      }
    }
  }
  lines.push(indent + '}');
}

/**
 * Serialize an object (not array, not primitive) into lines at the given depth.
 */
function serializeObject(obj, depth, lines) {
  const indent = '  '.repeat(depth);
  const indentInner = '  '.repeat(depth + 1);
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    lines.push(indent + '{}');
    return;
  }
  const sortedKeys = sortKeys(keys);
  lines.push(indent + '{');
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const val = obj[key];
    const isLast = i === sortedKeys.length - 1;
    serializeKeyValue(key, val, depth, isLast, lines);
  }
  lines.push(indent + '}');
}

/**
 * Serialize a key-value pair inside an object at the given depth.
 */
function serializeKeyValue(key, val, depth, isLast, lines) {
  const indentInner = '  '.repeat(depth + 1);
  const keyStr = indentInner + JSON.stringify(key) + ': ';

  if (val === null || typeof val !== 'object') {
    lines.push(keyStr + JSON.stringify(val) + (isLast ? '' : ','));
    return;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) {
      lines.push(keyStr + '[]' + (isLast ? '' : ','));
      return;
    }
    const items = isIdSortedArray(val)
      ? [...val].sort((a, b) => {
          const ai = a['@id'] || '';
          const bi = b['@id'] || '';
          return ai < bi ? -1 : ai > bi ? 1 : 0;
        })
      : val;
    lines.push(indentInner + JSON.stringify(key) + ': [');
    for (let j = 0; j < items.length; j++) {
      const itemLines = [];
      serializeAny(items[j], depth + 2, itemLines);
      if (j < items.length - 1) {
        itemLines[itemLines.length - 1] += ',';
      }
      for (const l of itemLines) lines.push(l);
    }
    lines.push(indentInner + ']' + (isLast ? '' : ','));
    return;
  }

  // nested object
  const subLines = [];
  serializeObject(val, depth + 1, subLines);
  lines.push(indentInner + JSON.stringify(key) + ': ' + subLines[0].trimStart());
  for (let si = 1; si < subLines.length - 1; si++) {
    lines.push(subLines[si]);
  }
  lines.push(subLines[subLines.length - 1] + (isLast ? '' : ','));
}

/**
 * Serialize any value (primitive, array, or object) at the given depth.
 */
function serializeAny(val, depth, lines) {
  const indent = '  '.repeat(depth);
  if (val === null || typeof val !== 'object') {
    lines.push(indent + JSON.stringify(val));
    return;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) {
      lines.push(indent + '[]');
      return;
    }
    const items = isIdSortedArray(val)
      ? [...val].sort((a, b) => {
          const ai = a['@id'] || '';
          const bi = b['@id'] || '';
          return ai < bi ? -1 : ai > bi ? 1 : 0;
        })
      : val;
    lines.push(indent + '[');
    for (let j = 0; j < items.length; j++) {
      const itemLines = [];
      serializeAny(items[j], depth + 1, itemLines);
      if (j < items.length - 1) {
        itemLines[itemLines.length - 1] += ',';
      }
      for (const l of itemLines) lines.push(l);
    }
    lines.push(indent + ']');
    return;
  }
  serializeObject(val, depth, lines);
}
