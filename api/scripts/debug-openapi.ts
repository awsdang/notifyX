import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const TestSchema = z.object({
    id: z.string().uuid(),
    name: z.string()
});

registry.register('Test', TestSchema);

try {
    const generator = new OpenApiGeneratorV3(registry.definitions);
    const spec = generator.generateDocument({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: '/' }]
    });
    console.log('Successfully generated spec');
} catch (error) {
    console.error('Generation failed:', error);
}
