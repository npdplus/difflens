import type { NormalizedObject, NormalizedValue } from './contracts';

const isNormalizedArray = (value: NormalizedValue): value is readonly NormalizedValue[] =>
  Array.isArray(value);

const asNormalizedObject = (value: NormalizedValue): NormalizedObject =>
  value as NormalizedObject;

const compareText = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const sortText = (values: Iterable<string>): string[] =>
  [...values].sort(compareText);

export const normalizedValuesEqual = (
  left: NormalizedValue,
  right: NormalizedValue,
): boolean => {
  if (left === right) {
    return true;
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isNaN(left) && Number.isNaN(right);
  }

  if (left === null || right === null || typeof left !== typeof right) {
    return false;
  }

  if (isNormalizedArray(left) || isNormalizedArray(right)) {
    if (!isNormalizedArray(left) || !isNormalizedArray(right) || left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      const leftValue = left[index];
      const rightValue = right[index];
      if (leftValue === undefined || rightValue === undefined) {
        return false;
      }
      if (!normalizedValuesEqual(leftValue, rightValue)) {
        return false;
      }
    }

    return true;
  }

  if (typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }

  const leftObject = asNormalizedObject(left);
  const rightObject = asNormalizedObject(right);
  const leftKeys = sortText(Object.keys(leftObject));
  const rightKeys = sortText(Object.keys(rightObject));

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key === undefined || key !== rightKeys[index]) {
      return false;
    }

    const leftValue = leftObject[key];
    const rightValue = rightObject[key];
    if (leftValue === undefined || rightValue === undefined) {
      return false;
    }

    if (!normalizedValuesEqual(leftValue, rightValue)) {
      return false;
    }
  }

  return true;
};

export const normalizedValueFingerprint = (value: NormalizedValue): string => {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'string':
      return `string:${JSON.stringify(value)}`;
    case 'number':
      if (Number.isNaN(value)) return 'number:NaN';
      if (value === Number.POSITIVE_INFINITY) return 'number:+Infinity';
      if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity';
      return `number:${String(value)}`;
    case 'boolean':
      return value ? 'boolean:true' : 'boolean:false';
    case 'object': {
      if (isNormalizedArray(value)) {
        return `array:[${value.map(normalizedValueFingerprint).join(',')}]`;
      }

      const objectValue = asNormalizedObject(value);
      return `object:{${sortText(Object.keys(objectValue))
        .map((key) => {
          const child = objectValue[key];
          if (child === undefined) {
            return `${JSON.stringify(key)}:missing`;
          }
          return `${JSON.stringify(key)}:${normalizedValueFingerprint(child)}`;
        })
        .join(',')}}`;
    }
    default:
      throw new TypeError('Unsupported normalized value type');
  }
};
