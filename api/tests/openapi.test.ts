import { describe, it, expect } from 'bun:test';
import { getOpenApiSpec } from '../src/docs/openapi';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('OpenAPI Spec', () => {
    it('should generate a valid OpenAPI object', () => {
        const spec = getOpenApiSpec();
        expect(spec).toBeDefined();
        expect(spec.openapi).toBe('3.0.0');
        expect(spec.info.title).toBe('NotifyX API');
        expect(spec.paths).toBeDefined();
    });

    it('should match the generated openapi.json file', () => {
        const spec = getOpenApiSpec();
        const filePath = resolve(process.cwd(), 'openapi.json');

        if (!existsSync(filePath)) {
            throw new Error('openapi.json does not exist. Run "bun run generate:openapi" first.');
        }

        const fileContent = readFileSync(filePath, 'utf-8');
        const fileSpec = JSON.parse(fileContent);

        // Normalize stringify for comparison to avoid formatting differences causing issues
        // though usually deep equality checks handle object equivalence
        expect(spec).toEqual(fileSpec);
    });

    it('should capture snapshot', () => {
        const spec = getOpenApiSpec();
        expect(spec).toMatchSnapshot();
    });
});
