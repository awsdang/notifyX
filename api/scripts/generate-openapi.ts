import { getOpenApiSpec } from '../src/docs/openapi';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

try {
    const spec = getOpenApiSpec();
    const outputPath = resolve(process.cwd(), 'openapi.json');

    writeFileSync(outputPath, JSON.stringify(spec, null, 2));
    console.log(`OpenAPI spec generated at ${outputPath}`);
    process.exit(0);
} catch (error) {
    console.error('Failed to generate OpenAPI spec:', error);
    process.exit(1);
}
