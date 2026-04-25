import { describe, it, expect } from 'vitest';

describe('Environment Setup', () => {
  it('should have Node.js environment', () => {
    expect(process.version).toBeDefined();
    expect(process.version).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('should load environment variables', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });

  it('should perform basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });
});
