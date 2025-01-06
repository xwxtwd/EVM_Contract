import { expect } from "chai";
// test/helpers/assertions.ts
export const bigintAssertions = {
  expectLessThan: (actual: bigint, expected: bigint, message?: string) => {
    expect(actual < expected, message).to.be.true;
  },

  expectLessThanOrEqual: (actual: bigint, expected: bigint, message?: string) => {
    expect(actual <= expected, message).to.be.true;
  },

  expectGreaterThan: (actual: bigint, expected: bigint, message?: string) => {
    expect(actual > expected, message).to.be.true;
  },

  expectGreaterThanOrEqual: (actual: bigint, expected: bigint, message?: string) => {
    expect(actual >= expected, message).to.be.true;
  },

  expectEqual: (actual: bigint, expected: bigint, message?: string) => {
    expect(actual === expected, message).to.be.true;
  },

  expectNotEqual: (actual: bigint, expected: bigint, message?: string) => {
    expect(actual !== expected, message).to.be.true;
  },

  expectZero: (actual: bigint, message?: string) => {
    expect(actual === 0n, message).to.be.true;
  },

  expectPositive: (actual: bigint, message?: string) => {
    expect(actual > 0n, message).to.be.true;
  },

  expectNegative: (actual: bigint, message?: string) => {
    expect(actual < 0n, message).to.be.true;
  }
};
